/**
 * Phase 5 — DRAIS event bus.
 *
 * Single typed publish/subscribe surface for cross-cutting events.
 * The first publisher is the attendance engine (Phase 3); the first
 * subscriber is the notification fanout (this Phase 5 module). New
 * publishers in later phases (device.connected, enrollment.created,
 * etc.) plug in here without coordinating with subscribers.
 *
 * Implementation strategy
 * -----------------------
 * v1 (this commit): in-process EventEmitter. Single-node, single-
 * server-process semantics. Sufficient for the Electron/desktop and
 * single-Vercel-instance footprints.
 *
 * v2 (when REDIS_URL is set): the bus interface stays identical — a
 * Redis Streams adapter publishes to a stream and consumers
 * subscribe via consumer groups. Adding it later requires NO change
 * to call sites; the adapter is picked at bus construction.
 *
 * Why typed
 * ---------
 * Untyped event names invite drift (one publisher emits
 * 'attendance.upserted', another listens for 'attendance.record.upserted',
 * silently they never connect). The EventMap below is the contract;
 * a publisher that emits an unknown event name fails type-check.
 *
 * Safety
 * ------
 *   - publish() is synchronous-fire, async-await for listeners. The
 *     caller awaits only that the listeners have STARTED — listeners
 *     themselves run independently and a slow/throwing listener does
 *     NOT block subsequent emits.
 *   - Listener errors are caught and logged; one bad listener cannot
 *     poison the others.
 *   - The bus survives a missing subscriber: emit-with-no-listeners
 *     is a no-op, not an error.
 */

import { EventEmitter } from 'node:events';

// ── Event contract ─────────────────────────────────────────────────────

export interface AttendanceRecordUpsertedEvent {
  schoolId: number;
  personId: number;
  roleType: 'student' | 'staff';
  attendanceDate: string;            // YYYY-MM-DD in local timezone
  status: 'present' | 'late' | 'absent' | 'half_day' | 'early_leave' | 'holiday' | 'weekend';
  previousStatus: string | null;
  firstInAt: string | null;          // ISO-8601 if set
  lastOutAt: string | null;
  lateMinutes: number;
  earlyMinutes: number;
  totalMinutes: number;
  ruleId: number | null;
}

/**
 * Phase 7 — emitted right after a raw punch is persisted to
 * zk_attendance_logs (and dual-written to attendance_raw_events). The
 * live-scan SSE subscribes to this for sub-second push delivery to
 * the LiveIdentityPopup; without it the SSE falls back to a 2-second
 * poll, so this event is an OPTIMISATION, not a correctness boundary.
 *
 * Payload deliberately carries only IDs + matched flag — the SSE
 * listener re-fetches the row using the same SELECT it uses for
 * polling, so the enrichment logic stays in one place.
 */
export interface AttendanceEventRecordedEvent {
  schoolId: number;
  scanId: number;                    // zk_attendance_logs.id (legacy)
  rawEventId: number | null;         // attendance_raw_events.id (canonical)
  deviceSn: string;
  deviceUserId: string;
  matched: boolean;
  // Resolved identity, already known at publish time (the ingest runs
  // resolveUser before the INSERT). Carrying it lets the lightweight
  // /live-identity SSE forward "which person" with NO database lookup,
  // so a client that already holds the roster (e.g. /students/list) can
  // render the popup instantly from in-memory data.
  studentId?: number | null;
  staffId?: number | null;
  checkTime?: string | null;         // actual instant (ISO) for display
}

export interface EventMap {
  'attendance.record.upserted': AttendanceRecordUpsertedEvent;
  'attendance.event.recorded':  AttendanceEventRecordedEvent;
}

// ── Bus interface ──────────────────────────────────────────────────────

export type EventName = keyof EventMap;
export type EventPayload<E extends EventName> = EventMap[E];
export type EventListener<E extends EventName> = (
  payload: EventPayload<E>,
) => void | Promise<void>;

export interface EventBus {
  publish<E extends EventName>(event: E, payload: EventPayload<E>): void;
  subscribe<E extends EventName>(event: E, listener: EventListener<E>): () => void;
  /** Number of registered listeners for an event (for diagnostics). */
  listenerCount(event: EventName): number;
}

// ── In-process implementation ─────────────────────────────────────────

class InProcessBus implements EventBus {
  private emitter = new EventEmitter({ captureRejections: true });

  constructor() {
    // captureRejections makes a Promise-returning listener that
    // rejects emit 'error' instead of becoming an unhandled rejection.
    // We swallow those into the logger so a misbehaving listener
    // cannot crash the process.
    this.emitter.on('error', (err: unknown) => {
      console.warn('[eventbus] listener rejected:', err);
    });
    // EventEmitter prints "MaxListenersExceededWarning" past 10
    // listeners — raise the cap so future subscribers don't trigger
    // false-positive warnings.
    this.emitter.setMaxListeners(64);
  }

  publish<E extends EventName>(event: E, payload: EventPayload<E>): void {
    // emit is synchronous; if no listeners, this is a cheap no-op.
    try {
      this.emitter.emit(event, payload);
    } catch (err) {
      // EventEmitter throws only when the listener throws synchronously
      // AND no 'error' handler is registered. We register one above, so
      // this catch is belt-and-braces.
      console.warn(`[eventbus] sync error in '${event}' listener:`, err);
    }
  }

  subscribe<E extends EventName>(
    event: E,
    listener: EventListener<E>,
  ): () => void {
    // Wrap listener so promise rejections route through 'error' and
    // sync throws are caught here.
    const wrapped = (payload: EventPayload<E>) => {
      try {
        const r = listener(payload);
        if (r && typeof (r as Promise<void>).then === 'function') {
          (r as Promise<void>).catch(err => {
            console.warn(`[eventbus] listener rejected for '${event}':`, err);
          });
        }
      } catch (err) {
        console.warn(`[eventbus] listener threw for '${event}':`, err);
      }
    };
    this.emitter.on(event, wrapped);
    return () => { this.emitter.off(event, wrapped); };
  }

  listenerCount(event: EventName): number {
    return this.emitter.listenerCount(event);
  }
}

// ── Module singleton ──────────────────────────────────────────────────

// Single bus per Node process. Cached on globalThis so Next.js hot-
// reload during dev doesn't fragment subscribers across reloaded
// modules.
const GLOBAL_BUS_KEY = '__drais_eventbus__' as const;
type GlobalWithBus = typeof globalThis & { [GLOBAL_BUS_KEY]?: EventBus };
const g = globalThis as GlobalWithBus;

function makeBus(): EventBus {
  // Future hook for the Redis adapter:
  //   if (process.env.REDIS_URL) return new RedisStreamsBus();
  return new InProcessBus();
}

export function getEventBus(): EventBus {
  if (!g[GLOBAL_BUS_KEY]) {
    g[GLOBAL_BUS_KEY] = makeBus();
  }
  return g[GLOBAL_BUS_KEY]!;
}

/**
 * Module-load-time hook for subscribers. Call from a 'use server' or
 * route-handler import so the subscriber registers on cold start.
 *
 * Idempotent — re-registering the same subscriber function is fine
 * (the bus only counts each call once via the returned unsubscribe).
 */
export function publishEvent<E extends EventName>(
  event: E,
  payload: EventPayload<E>,
): void {
  getEventBus().publish(event, payload);
}
