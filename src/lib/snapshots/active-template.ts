export interface ResolveActiveTemplateIdOptions {
  mode: 'emergency' | 'drce';
  selectedDrceTemplateId?: string;
  activeDrceTemplateId?: string;
  fallbackTemplateId?: string;
  availableTemplateIds?: string[];
}

export function resolveActiveTemplateId(opts: ResolveActiveTemplateIdOptions): string {
  const {
    mode,
    selectedDrceTemplateId,
    activeDrceTemplateId,
    fallbackTemplateId = 'drce-emergency-secular',
    availableTemplateIds = [],
  } = opts;

  if (mode !== 'drce') {
    return fallbackTemplateId;
  }

  const candidates = [selectedDrceTemplateId, activeDrceTemplateId, ...availableTemplateIds, fallbackTemplateId]
    .filter((value): value is string => Boolean(value && value.trim()));

  const normalized = new Set(candidates.map(candidate => candidate.trim()));
  return Array.from(normalized)[0] ?? fallbackTemplateId;
}
