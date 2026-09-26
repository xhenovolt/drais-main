/**
 * Ready-made ID card designs every school can start from. Templates hold only layout, styling and
 * {placeholders} — never another school's name, learners or contact details — so a school that
 * picks one gets its own name, logo, address and learners on the same design.
 */
import type { IdCardSpec } from './spec';
import { PUBLISHER_STUDENT_ID_SPEC } from './templates/publisher-student-id';

export interface IdCardTemplate {
  id: string;
  name: string;
  description: string;
  spec: IdCardSpec;
}

export const ID_CARD_TEMPLATES: IdCardTemplate[] = [
  {
    id: 'publisher-student-id',
    name: 'Student ID — two-sided (from the school Publisher template)',
    description:
      'Blue-bordered card with the school badge and photo on the left, name / class / ID / signature lines on the right, ' +
      'and the address, phone and “if found” wording on the back. Imported from a Microsoft Publisher template.',
    spec: PUBLISHER_STUDENT_ID_SPEC,
  },
];

/** A private copy, so editing a design never changes the shared template. */
export const cloneSpec = (spec: IdCardSpec): IdCardSpec => JSON.parse(JSON.stringify(spec));
