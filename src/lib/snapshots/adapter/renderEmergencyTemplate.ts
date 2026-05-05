/**
 * Pure string-replace template renderer.
 *
 * Applies a placeholder map and a pre-rendered subjects HTML block to a
 * `{{key}}` / `{{#subjects}}…{{/subjects}}` template. Logic mirrors the
 * inline replacement loops in the three emergency routes so output is
 * byte-compatible per student.
 */
import type { TemplateRenderOutput } from './toTemplateMap';

const SUBJECTS_BLOCK_RE = /\{\{#subjects\}\}[\s\S]*?\{\{\/subjects\}\}/g;
const PLACEHOLDER_RE = (key: string) =>
  new RegExp(`\\{\\{${key.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}\\}\\}`, 'g');

export function renderEmergencyTemplate(
  template: string,
  out: TemplateRenderOutput,
): string {
  let html = template.replace(SUBJECTS_BLOCK_RE, out.subjectsHtml);
  for (const [k, v] of Object.entries(out.placeholders)) {
    html = html.replace(PLACEHOLDER_RE(k), v);
  }
  return html;
}
