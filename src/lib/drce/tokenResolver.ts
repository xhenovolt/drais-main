// src/lib/drce/tokenResolver.ts
// Resolves {token} placeholders in content strings using DRCEDataContext.
// Tokens wrap data-context paths: {student.fullName}, {meta.term}, etc.

import type { DRCEDataContext } from './schema';
import { getByPath } from './bindingResolver';

/**
 * Replace all {path} tokens in text with their resolved values.
 * Unknown tokens are left as-is.
 */
export function resolveToken(text: string, ctx: DRCEDataContext): string {
  return text.replace(/\{([^}]+)\}/g, (match, path: string) => {
    const root: Record<string, unknown> = {
      student:    ctx.student,
      assessment: ctx.assessment,
      comments:   ctx.comments,
      meta:       ctx.meta,
    };

    const val = getByPath(root, path);
    return val !== undefined && val !== null ? String(val) : match;
  });
}
