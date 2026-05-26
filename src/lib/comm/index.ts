/**
 * Communication Event Engine — public surface.
 *
 *   emit('learner.attendance.checkin', { schoolId, studentId, ... })
 *
 * The engine handles template resolution, recipient lookup, provider
 * dispatch, quiet-hours, and audit logging. Callers do not have to
 * know whether the school is in auto or manual mode — the engine
 * decides and either fires or stages the message.
 */
export { emit, manualSendFromLog } from './dispatcher';
export type { DispatchSummary } from './dispatcher';
export type {
  CommEventType,
  CommEventPayloadMap,
  CommAudience,
  CommChannel,
  CommEventBase,
} from './events';
export { ALL_EVENT_TYPES } from './events';
export { getCommSettings, updateCommSettings, isQuietHours } from './settings';
export type { CommSettings } from './settings';
export { resolveTemplate, renderTemplate, applyPrefix } from './templates';
export type { CommTemplate } from './templates';
export { getProvider, listProviders } from './providers';
export { resolveRecipients } from './recipients';
export type { Recipient } from './recipients';
