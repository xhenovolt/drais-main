export interface ProvisionalAttendanceMeta {
  isProvisional: boolean;
  provisionalReason: string | null;
  displayStatus: string;
  smsBehavior: 'skip' | 'normal';
}

export function getProvisionalAttendanceMeta(input: {
  matched: boolean;
  personId: number | null;
  isProvisional?: boolean;
}): ProvisionalAttendanceMeta {
  const matched = Boolean(input.matched);
  const hasPerson = Boolean(input.personId);
  const forcedProvisional = Boolean(input.isProvisional);

  if (forcedProvisional || (!matched && !hasPerson)) {
    return {
      isProvisional: true,
      provisionalReason: 'identity_unresolved',
      displayStatus: 'Provisional',
      smsBehavior: 'skip',
    };
  }

  return {
    isProvisional: false,
    provisionalReason: null,
    displayStatus: matched ? 'Matched' : 'Unmatched',
    smsBehavior: 'normal',
  };
}
