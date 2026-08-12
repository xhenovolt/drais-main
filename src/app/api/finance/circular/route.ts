/**
 * GET /api/finance/circular?term_id=&class_id=
 *
 * The fee circular — the document a school sends home saying "these are the
 * fees, this is who pays them, this is the total".
 *
 * WHY THIS EXISTS
 * DRAIS already held every part of the answer and no surface assembled it.
 * `fee_items` holds the fees and `fee_eligibility_rules` holds who each one
 * applies to, but the only way to see a learner's fees was to pick a learner
 * and evaluate. A school preparing for a term needs the opposite view: per
 * CLASS, before any learner is billed, so it can be checked, approved and
 * printed. Schools do this on paper every term; doing it by hand from a rules
 * table is exactly the error-prone step worth removing.
 *
 * HOW APPLICABILITY IS DECIDED
 * A fee applies to a class when it has a rule that either names the class or
 * names no class at all ("all learners"). Rules that additionally depend on
 * something not known at class level — boarding status, gender, entrant status
 * — cannot be resolved for a whole class, so they are NOT silently included in
 * the total. They are returned separately as `conditional`, with the condition
 * stated, so the printed circular can say "boarders also pay…" instead of
 * quietly overstating or understating what a parent owes.
 *
 * That distinction is the entire point. A circular that adds a boarding fee to
 * a day scholar's total, or omits it for a boarder, is worse than no circular:
 * the school is asked for money it cannot justify, or fails to collect money it
 * needs.
 *
 * Class ids are compared as STRINGS. `classes.id` is a BIGINT and
 * `fee_eligibility_rules.class_ids` stores its elements as numbers in most rows
 * and strings in others — the same mismatch that made the fee-items screen show
 * "#392002" instead of "BABY CLASS".
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { checkModule } from '@/lib/auth/requireModule';

export const runtime = 'nodejs';

interface CircularItem {
  id: number;
  name: string;
  code: string | null;
  category: string;
  amount: number;
  frequency: string | null;
  mandatory: boolean;
  /** Present only for conditional items — the condition in plain words. */
  condition?: string;
}

/** Parse the JSON column safely; a malformed row must not break the circular. */
function parseIds(raw: unknown): string[] {
  if (raw == null) return [];
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch { return []; }
}

/** The human phrasing of a rule's extra conditions, or null when there are none. */
function conditionOf(r: any): string | null {
  const parts: string[] = [];
  if (r.boarding) parts.push(String(r.boarding) === 'boarding' ? 'boarders only' : 'day scholars only');
  if (r.gender)   parts.push(String(r.gender).toLowerCase() === 'male' ? 'boys only' : 'girls only');
  if (Number(r.is_candidate) === 1)   parts.push('candidates only');
  if (Number(r.is_new_entrant) === 1) parts.push('new entrants only');
  return parts.length ? parts.join(', ') : null;
}

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;

  const sp = req.nextUrl.searchParams;
  const termId = sp.get('term_id');
  const onlyClass = sp.get('class_id');

  const [classes, items, rules, term] = await Promise.all([
    query(
      `SELECT id, name FROM classes
        WHERE school_id = ? AND deleted_at IS NULL
        ${onlyClass ? 'AND id = ?' : ''}
        ORDER BY name`,
      onlyClass ? [session.schoolId, onlyClass] : [session.schoolId],
    ).catch(() => []) as Promise<any[]>,

    // Inactive fees are excluded: a circular is a statement of what is payable
    // now, and ALBAYAN has two deliberately inactive items sitting at 0.
    query(
      `SELECT id, name, code, category, default_amount, currency, frequency, mandatory
         FROM fee_items
        WHERE school_id = ? AND is_active = 1
        ORDER BY category, name`,
      [session.schoolId],
    ).catch(() => []) as Promise<any[]>,

    query(
      `SELECT fee_item_id, class_ids, boarding, gender, is_candidate, is_new_entrant, amount
         FROM fee_eligibility_rules
        WHERE school_id = ? AND is_active = 1`,
      [session.schoolId],
    ).catch(() => []) as Promise<any[]>,

    termId
      ? query(`SELECT id, name FROM terms WHERE id = ? AND school_id = ? LIMIT 1`,
          [termId, session.schoolId]).catch(() => []) as Promise<any[]>
      : Promise.resolve([] as any[]),
  ]);

  const itemById = new Map<string, any>(items.map((i) => [String(i.id), i]));

  const perClass = classes.map((cls) => {
    const applies: CircularItem[] = [];
    const conditional: CircularItem[] = [];
    const seen = new Set<string>();

    for (const r of rules) {
      const item = itemById.get(String(r.fee_item_id));
      if (!item) continue;                     // rule points at an inactive/absent fee

      const ids = parseIds(r.class_ids);
      const forThisClass = ids.length === 0 || ids.some((id) => id === String(cls.id));
      if (!forThisClass) continue;

      // A rule may override the fee's default amount.
      const amount = Number(r.amount ?? item.default_amount ?? 0);
      const cond = conditionOf(r);

      const row: CircularItem = {
        id: Number(item.id),
        name: item.name,
        code: item.code ?? null,
        category: item.category ?? 'other',
        amount,
        frequency: item.frequency ?? null,
        mandatory: Number(item.mandatory) === 1,
      };

      if (cond) {
        conditional.push({ ...row, condition: cond });
      } else {
        // De-duplicate: several rules can grant the same fee to one class, and
        // counting it twice would inflate the total a parent is shown.
        const key = String(item.id);
        if (seen.has(key)) continue;
        seen.add(key);
        applies.push(row);
      }
    }

    const groups = Object.values(
      applies.reduce((acc: Record<string, { category: string; items: CircularItem[]; subtotal: number }>, it) => {
        (acc[it.category] ??= { category: it.category, items: [], subtotal: 0 });
        acc[it.category].items.push(it);
        acc[it.category].subtotal += it.amount;
        return acc;
      }, {}),
    ).sort((a, b) => b.subtotal - a.subtotal);

    return {
      class_id: Number(cls.id),
      class_name: cls.name,
      groups,
      conditional,
      total: applies.reduce((s, i) => s + i.amount, 0),
      mandatory_total: applies.filter((i) => i.mandatory).reduce((s, i) => s + i.amount, 0),
    };
  });

  return NextResponse.json({
    success: true,
    term: term[0] ?? null,
    currency: items[0]?.currency ?? 'UGX',
    classes: perClass,
    generated_at: new Date().toISOString(),
  });
}
