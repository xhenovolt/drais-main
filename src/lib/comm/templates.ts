/**
 * Template resolution and placeholder rendering.
 *
 * Lookup order for a given (school, event_type, channel, language):
 *   1. School-scoped active template (school_id = N)
 *   2. Global active template (school_id IS NULL)
 *   3. null
 *
 * Placeholder syntax: {{key}} — replaced from the event payload at
 * dispatch time. Unknown keys render as the empty string (so a stale
 * template doesn't blow up production).
 */
import { query } from '@/lib/db';
import type { CommChannel, CommEventType } from './events';

export interface CommTemplate {
  id:          number;
  schoolId:    number | null;
  eventType:   CommEventType;
  channel:     CommChannel;
  body:        string;
  language:    string;
  isActive:    boolean;
  description: string | null;
}

interface Raw {
  id:          number;
  school_id:   number | null;
  event_type:  string;
  channel:     CommChannel;
  body:        string;
  language:    string;
  is_active:   number;
  description: string | null;
}

function toTpl(r: Raw): CommTemplate {
  return {
    id:          r.id,
    schoolId:    r.school_id,
    eventType:   r.event_type as CommEventType,
    channel:     r.channel,
    body:        r.body,
    language:    r.language,
    isActive:    r.is_active === 1,
    description: r.description,
  };
}

export async function resolveTemplate(args: {
  schoolId:  number;
  eventType: CommEventType;
  channel:   CommChannel;
  language?: string;
}): Promise<CommTemplate | null> {
  const lang = args.language ?? 'en';

  // 1) school-scoped
  const own = (await query(
    `SELECT * FROM comm_templates
      WHERE school_id = ? AND event_type = ? AND channel = ? AND language = ?
        AND is_active = 1
      LIMIT 1`,
    [args.schoolId, args.eventType, args.channel, lang],
  )) as Raw[];
  if (own.length) return toTpl(own[0]);

  // 2) global
  const global = (await query(
    `SELECT * FROM comm_templates
      WHERE school_id IS NULL AND event_type = ? AND channel = ? AND language = ?
        AND is_active = 1
      LIMIT 1`,
    [args.eventType, args.channel, lang],
  )) as Raw[];
  if (global.length) return toTpl(global[0]);

  return null;
}

/** Replace {{key}} occurrences. Missing keys → empty string. */
export function renderTemplate(body: string, payload: Record<string, unknown>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = payload[key];
    if (v === null || v === undefined) return '';
    return String(v);
  });
}

/** Apply the school's prefix (e.g. "[ALBAYAN]") to a rendered body.
 *  Idempotent: doesn't re-prepend if the prefix is already present. */
export function applyPrefix(body: string, prefix: string | null): string {
  if (!prefix) return body;
  if (body.startsWith(prefix)) return body;
  return `${prefix}\n${body}`;
}
