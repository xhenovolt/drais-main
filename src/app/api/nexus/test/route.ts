/**
 * POST /api/nexus/test — check the provider without asking a question.
 *
 * WHY THIS EXISTS
 * "Is Nexus working?" was only answerable by asking a real question and
 * interpreting the failure, and the failure said "provider error (403)" — a
 * number, when the provider had replied in plain words: "your newly created
 * team doesn't have any credits or licenses yet". Two different problems, a
 * bad key and an unfunded account, both surfaced as the same opaque code.
 *
 * This calls the provider's cheapest endpoint (model list) and hands back
 * exactly what it said, so setup can be verified before anyone types a
 * question — and so the remedy (fix the key vs. add credit vs. correct the
 * model name) is visible rather than inferred.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getNexusConfig, getNexusApiKey, NEXUS_NAME } from '@/lib/nexus/config';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!session.isSuperAdmin) {
    return NextResponse.json({ error: 'Super administrators only.' }, { status: 403 });
  }

  const cfg = await getNexusConfig();
  const key = await getNexusApiKey();
  if (!key) {
    return NextResponse.json({
      ok: false,
      stage: 'config',
      message: `No key is configured. Add one in Setup, or set NEXUS_API_KEY in the server environment.`,
    });
  }

  const base = cfg.baseUrl.replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/models`, {
      headers: { authorization: `Bearer ${key}` },
    });
    const raw = await res.text().catch(() => '');

    if (!res.ok) {
      let reason = '';
      try {
        const p = JSON.parse(raw);
        reason = String(p?.error?.message ?? p?.error ?? p?.message ?? '').trim();
      } catch { reason = raw.trim(); }
      return NextResponse.json({
        ok: false,
        stage: 'provider',
        status: res.status,
        // The provider's own sentence, verbatim. It is almost always more
        // actionable than anything this code could infer from a status code.
        message: reason || `Provider returned ${res.status}.`,
        keySource: cfg.keySource,
      });
    }

    let models: string[] = [];
    try {
      const p = JSON.parse(raw);
      models = (p?.data ?? []).map((m: any) => String(m?.id)).filter(Boolean);
    } catch { /* provider returned something unexpected but succeeded */ }

    // A valid key with a model name the account cannot use is the next failure
    // after billing, so it is worth catching here rather than at question time.
    const modelOk = models.length === 0 || models.includes(cfg.model);

    return NextResponse.json({
      ok: modelOk,
      stage: modelOk ? 'ready' : 'model',
      message: modelOk
        ? `${NEXUS_NAME} reached the provider successfully.`
        : `The key works, but "${cfg.model}" is not in this account's model list.`,
      model: cfg.model,
      availableModels: models.slice(0, 25),
      keySource: cfg.keySource,
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      stage: 'network',
      message: `Could not reach ${base}: ${e?.message ?? 'network error'}`,
    });
  }
}
