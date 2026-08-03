# `src/lib/comm/` — Communication event engine

Everything that sends a message to a parent, staff member or admin. Callers emit a typed event; the engine decides whether anything is actually sent.

## The one call you need

```ts
import { emit } from '@/lib/comm';

emit('learner.attendance.checkin', { schoolId, studentId, ... });
```

**Callers do not decide whether to send.** They state what happened. The engine resolves rules, templates, recipients, provider, quiet hours and audit — and either fires or stages the message. A feature that formats its own SMS and calls the provider directly bypasses every school preference and every log.

## Dispatch

```
emit(eventType, payload)
   ↓
load active rules for (schoolId, eventType)
   ↓
per rule:
   auto_send = false  →  log as 'queued' (source='auto'), stop
                         staff review + send from the dispatch-log UI
   auto_send = true   →  resolve recipients → render template
                         → send via provider → one log row per recipient
   ↓
return a DispatchSummary   (always — so callers can audit what happened)
```

The manual path is not a degraded mode. A school that wants a human to read every message before it goes to parents is a supported configuration, and `manualSendFromLog` completes it later.

## Templates

Resolution order for (school, event type, channel, language):

1. School-scoped active template (`school_id = N`)
2. Global active template (`school_id IS NULL`)
3. `null` — nothing sends

Placeholders are `{{key}}`, filled from the event payload at dispatch time. **Unknown keys render as an empty string** so a template left stale by a payload change degrades to a slightly odd message rather than a production exception.

## Files

| File | Purpose |
|---|---|
| `index.ts` | The public surface. Import from here. |
| `events.ts` | The event catalog — the `CommEventType` union and `CommEventPayloadMap`. |
| `dispatcher.ts` | The flow above. |
| `templates.ts` | Resolution + rendering. |
| `recipients.ts` | Audience resolution for **event-driven** rules. Every resolver filters by `school_id` even when the calling rule already did — defence in depth. |
| `audience-resolver.ts` | Audience resolution for **manual one-off broadcasts** ("all parents in class X"). Distinct from `recipients.ts` on purpose; the two answer different questions. |
| `providers.ts` | Provider abstraction. The dispatcher selects by name from `comm_settings.default_provider` or a per-call override. |
| `settings.ts` | Per-school settings. **Auto-creates a default row on first read**, so nothing downstream ever handles "this school has no settings yet". |
| `adms-attendance.ts` | Bridge from the ZKTeco ADMS push handler: looks up the person, decides check-in vs check-out from `INOUTMODE` (0 = check-in per ZKTeco convention; other modes default to check-in so single-mode devices still produce arrival messages), then emits. Fire-and-forget. |

## Adding an event

1. Append a member to the `CommEventType` union in `events.ts`.
2. Add its payload shape to `CommEventPayloadMap`.
3. Create a template for it — a global one (`school_id IS NULL`) via `/api/admin/comm/templates`, or per school.
4. Call `emit('your.event', payload)` from the originating code path.

**Skipping step 3 means the event resolves to no template and silently sends nothing.** That is the failure mode to watch for when a new notification "doesn't work".

> `events.ts` currently instructs you to seed a default in `src/lib/comm/seed-templates.ts`. **That file does not exist** — there is no code-level template seeding. Templates are rows, created through the admin API or a schema export. Treat the comment as stale.

## Adding a provider

Implement `CommProvider` in `providers.ts` (or `providers/<name>.ts`), register it in `PROVIDERS`, and allow its code from the settings UI.

## Working in this folder

- **Never call an SMS provider directly from a feature.** Emit an event.
- **Keep `emit` fire-and-forget at call sites** on hot paths — an attendance punch must not wait on an SMS.
- **Tenant-scope every resolver**, including when the caller already scoped.
- **Unknown placeholders stay non-fatal.** Don't "improve" this into a throw.

## Known constraints

- **Delivery is provider-reported, not guaranteed.** The log records what the provider accepted.
- **Quiet hours delay or drop a message** depending on configuration — a missing message at 2am is usually policy, not a bug.
- **SMS costs are platform-level.** One Africa's Talking account serves every school; per-school quota and usage accounting live in [`../control/sms-economics.ts`](../control/README.md).
- **`logSMSActivity` is a console no-op.** Structured usage comes from `SMS_SENT` audit events.

## Dependencies

`src/lib/db` · `src/lib/africastalking` (SMS, phone normalization)

## Related

[`../control/README.md`](../control/README.md) — SMS economics · [`../notifications/`](../notifications/) — the outbox and drainer used by pass-outs · [`../ingestion/README.md`](../ingestion/README.md)
