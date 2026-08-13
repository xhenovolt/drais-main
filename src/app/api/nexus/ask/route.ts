/**
 * POST /api/nexus/ask — ask Nexus a question about this school.
 *
 * FLOW
 *   question → model picks a tool → server runs it (scoped) → model answers
 *
 * The model never touches the database. It receives a catalogue of tool names
 * and returns which one to call with which arguments; this route runs the
 * query with `school_id` from the SESSION and feeds the rows back. See
 * src/lib/nexus/tools.ts for why that boundary exists.
 *
 * WHAT LEAVES YOUR SERVERS
 * The question, the tool results, and the school name. Tool results include
 * learner names and balances, because a bursar asking "who owes the most"
 * needs names to act on. They never include contacts, guardians, credentials
 * or payment instruments. Anyone enabling Nexus should know this is the trade:
 * the answer is only useful if the data goes with the question.
 *
 * TENANCY
 * `school_id` comes from the session on every tool call and is never taken
 * from the model's arguments — a prompt cannot ask for another school's data
 * because there is no argument through which to ask.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { checkAnyPermission } from '@/lib/rbac';
import { getNexusConfig, getNexusApiKey, NEXUS_NAME } from '@/lib/nexus/config';
import { TOOLS_BY_NAME, toolSpecs } from '@/lib/nexus/tools';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Hard ceiling on tool round-trips, so a loop cannot bill you indefinitely. */
const MAX_TOOL_ROUNDS = 4;

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Reading school-wide figures is an administrative act. Accepts the coarse
  // legacy code too, so this is not gated on a permission nobody holds.
  const denied = await checkAnyPermission(
    session.userId, session.schoolId, ['school.read', 'school.update'], session.isSuperAdmin,
  );
  if (denied) return denied;

  const cfg = await getNexusConfig();
  if (!cfg.enabled || !cfg.hasKey) {
    return NextResponse.json(
      { error: `${NEXUS_NAME} is not set up yet. Add a provider key in Settings → ${NEXUS_NAME}.`, code: 'NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const question = String(body?.question ?? '').trim();
  if (!question) return NextResponse.json({ error: 'Ask a question.' }, { status: 400 });
  if (question.length > 2000) return NextResponse.json({ error: 'That question is too long.' }, { status: 400 });

  const apiKey = await getNexusApiKey();
  if (!apiKey) return NextResponse.json({ error: `${NEXUS_NAME} has no key configured.` }, { status: 503 });

  const schoolRows = (await query(
    `SELECT name FROM schools WHERE id = ? LIMIT 1`, [session.schoolId],
  ).catch(() => [])) as any[];
  const schoolName = schoolRows[0]?.name ?? 'this school';

  const messages: any[] = [
    {
      role: 'system',
      content:
        `You are ${NEXUS_NAME}, the assistant inside DRAIS, a school management system. ` +
        `You are answering for ${schoolName} and can see ONLY that school's records. ` +
        `Use the provided tools to look things up — never guess a number. ` +
        `If a tool returns nothing, say so plainly rather than inventing a figure. ` +
        `If a question cannot be answered with the available tools, say what you cannot see. ` +
        `Answer briefly and concretely, using the school's own vocabulary (learners, classes, terms, fees). ` +
        `Amounts are in the school's currency; state figures exactly as returned.`,
    },
    { role: 'user', content: question },
  ];

  const called: Array<{ tool: string; args: unknown }> = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          tools: toolSpecs(),
          tool_choice: 'auto',
          temperature: 0.2,
        }),
      });

      if (!res.ok) {
        const raw = await res.text().catch(() => '');
        // Pull the provider's own sentence out of its JSON envelope and put it
        // IN THE ERROR MESSAGE, not in a side field.
        //
        // This previously returned a bare "provider error (403)" with the real
        // reason tucked into `detail`, which the screen did not render. xAI had
        // said, in plain words, "your newly created team doesn't have any
        // credits or licenses yet" — an answer the operator could act on in a
        // minute — and DRAIS replaced it with a number. A 403 for no credit, a
        // 403 for a revoked key and a 401 for a typo need three different
        // actions, so the distinction has to reach the person.
        let reason = '';
        try {
          const parsed = JSON.parse(raw);
          reason = String(parsed?.error?.message ?? parsed?.error ?? parsed?.message ?? '').trim();
        } catch { reason = raw.trim(); }

        const hint =
          res.status === 401 ? ' The key looks wrong — check it in Setup.'
          : res.status === 403 ? ' The key is valid but the provider account cannot be used yet — usually billing or credits.'
          : res.status === 404 ? ' The model name may not exist on this provider.'
          : res.status === 429 ? ' Rate limited — try again shortly.'
          : '';

        return NextResponse.json(
          {
            error: reason
              ? `${NEXUS_NAME} could not reach the provider (${res.status}): ${reason.slice(0, 300)}${hint}`
              : `${NEXUS_NAME} provider error (${res.status}).${hint}`,
            status: res.status,
            provider: reason.slice(0, 300) || null,
          },
          { status: 502 },
        );
      }

      const json: any = await res.json();
      const choice = json?.choices?.[0];
      const msg = choice?.message;
      if (!msg) return NextResponse.json({ error: 'Empty response from the provider.' }, { status: 502 });

      const toolCalls = msg.tool_calls ?? [];
      if (!toolCalls.length) {
        return NextResponse.json({
          success: true,
          answer: String(msg.content ?? '').trim() || 'No answer was produced.',
          used: called,
        });
      }

      messages.push(msg);

      for (const call of toolCalls) {
        const name = call?.function?.name;
        const tool = TOOLS_BY_NAME.get(name);
        let result: unknown;

        if (!tool) {
          result = { error: `Unknown tool "${name}".` };
        } else {
          let args: Record<string, any> = {};
          try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = {}; }
          called.push({ tool: name, args });
          try {
            // school_id is passed from the SESSION, never from `args`.
            result = await tool.run(session.schoolId, args);
          } catch (e: any) {
            // Reported, not swallowed. A tool that fails must not read to the
            // model as "there is no data" — that turns a broken query into a
            // confident wrong answer.
            result = { error: `Lookup failed: ${e?.message ?? 'unknown error'}` };
          }
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 20000),
        });
      }
    }

    return NextResponse.json(
      { error: `${NEXUS_NAME} could not settle on an answer.`, used: called },
      { status: 504 },
    );
  } catch (e: any) {
    return NextResponse.json({ error: `Could not reach the provider: ${e?.message ?? 'network error'}` }, { status: 502 });
  }
}
