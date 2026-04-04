// ============================================================================
// ArabicTemplateClone.tsx
// Clone of the Arabic-first report template — identical rendering logic.
// Phase 6: Used to expose "Arabic (Clone)" in the template dropdown.
//
// When selectedTemplate === 'arabic-clone', the reports page uses the
// 'arabic' rendering branch (RTL-emphasized layout), confirming template
// switching works end-to-end without modifying core logic.
// ============================================================================

export const TEMPLATE_KEY = 'arabic-clone' as const;
export const TEMPLATE_LABEL = 'Arabic (Clone)';

/**
 * Marker: 'arabic-clone' renders the same output as 'arabic'.
 * Arabic layout = default layout with RTL direction emphasis on the header
 * and Arabic subject name preference (via getSubjectName(r, 'ar')).
 */
const ArabicTemplateClone = null;
export default ArabicTemplateClone;
