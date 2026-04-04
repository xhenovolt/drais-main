// ============================================================================
// DefaultTemplateClone.tsx
// Clone of the default report template — identical rendering logic.
// Phase 6: Used to expose "Default (Clone)" in the template dropdown.
//
// This file is intentionally a thin registry entry. The actual rendering
// for both 'default' and 'default-clone' is handled by the same inline
// logic in page.tsx. This file exists so the template registry is explicit
// and the dropdown option resolves to a known, importable reference.
// ============================================================================

export const TEMPLATE_KEY = 'default-clone' as const;
export const TEMPLATE_LABEL = 'Default (Clone)';

/**
 * Marker: when selectedTemplate === 'default-clone', the reports page
 * falls through to the standard default inline renderer — same output as
 * 'default', verifying template switching without altering the layout.
 */
const DefaultTemplateClone = null;
export default DefaultTemplateClone;
