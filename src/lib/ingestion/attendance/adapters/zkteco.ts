/**
 * ZKTeco adapter — converts node-zklib SDK objects into canonical
 * AttendanceEvent[]. Replaces the per-route ad-hoc logic in
 * src/app/api/attendance/zk-tcp/route.ts (Phase 2 will migrate the
 * route onto this adapter; this commit just ships the adapter).
 *
 * ZKTeco SDK record shape (verified against Phase 0 audit of
 * /api/attendance/zk-tcp and services/attendance/attendanceEngine.ts):
 *
 *   {
 *     userId:    string,        // device-side user id (string of digits usually)
 *     uid:       number,        // internal device row id (NOT the identity)
 *     timestamp: number | Date, // UNIX-seconds OR Date
 *     state:     number,        // 0 = check-in, 1 = check-out (vendor docs vary)
 *     type:      number,        // method: 1=fingerprint, 4=card, 15=face
 *   }
 *
 * Phase 0 finding "ZKTeco SDK objects passed direct to DB" is fixed
 * here — the adapter normalises field names, timestamps, and runs
 * identity resolution through the central resolver.
 */

import type { AttendanceAdapter, AttendanceAdapterResult } from '../event';
import { buildEvent, toCanonicalIsoUtc } from '../event';
import type { AttendanceEvent } from '../../types';

interface ZKTecoRecord {
  userId?: string | number;
  uid?: number;
  timestamp?: number | string | Date;
  state?: number;
  type?: number;
}

interface ZKTecoPayload {
  vendor: 'zkteco';
  deviceSerial: string;
  records: ZKTecoRecord[];
}

const METHOD_CODE_MAP: Record<number, AttendanceEvent['method']> = {
  0: 'password',
  1: 'fingerprint',
  4: 'card',
  15: 'face',
};

const STATE_CODE_MAP: Record<number, AttendanceEvent['direction']> = {
  0: 'in',
  1: 'out',
  // Some ZKTeco firmwares emit 2/3/4/5 for break-in/break-out; we map them
  // to in/out conservatively. Vendor-specific deviation can be added later
  // without touching the canonical event.
  2: 'out',
  3: 'in',
  4: 'out',
  5: 'in',
};

export const zktecoAdapter: AttendanceAdapter<ZKTecoPayload> = {
  vendor: 'zkteco',

  canHandle(payload: unknown): payload is ZKTecoPayload {
    return (
      typeof payload === 'object'
      && payload !== null
      && (payload as { vendor?: string }).vendor === 'zkteco'
      && Array.isArray((payload as { records?: unknown }).records)
    );
  },

  async adapt(payload, resolver, options) {
    const events: AttendanceEvent[] = [];
    const errors: AttendanceAdapterResult['errors'] = [];
    let orphanedCount = 0;

    for (let i = 0; i < payload.records.length; i++) {
      const r = payload.records[i];
      const locator = `records[${i}]`;

      const ts = toCanonicalIsoUtc(r.timestamp);
      if (!ts) {
        errors.push({ locator, message: 'unparseable timestamp', category: 'timestamp' });
        continue;
      }

      const userIdStr = r.userId == null ? '' : String(r.userId);
      if (!userIdStr) {
        errors.push({ locator, message: 'missing userId', category: 'payload' });
        continue;
      }

      const identity = await resolver({
        deviceUserId: userIdStr,
        deviceSerial: payload.deviceSerial,
      });

      if (identity.personId == null || identity.personRole == null) {
        orphanedCount++;
        errors.push({
          locator,
          message: `device user ${userIdStr} not mapped to any DRAIS person`,
          category: 'identity',
        });
        continue;
      }

      events.push(
        buildEvent({
          personId: identity.personId,
          personRole: identity.personRole,
          timestampUtc: ts,
          direction: STATE_CODE_MAP[r.state ?? -1] ?? options?.defaultDirection ?? 'unknown',
          method: METHOD_CODE_MAP[r.type ?? -1] ?? 'other',
          vendor: 'zkteco',
          deviceSerial: payload.deviceSerial,
          deviceUserId: userIdStr,
          rawPayloadRef: options?.rawPayloadRef,
          lateAfterHHMM: options?.lateAfterHHMM,
          vendorExtras: { uid: r.uid, state: r.state, type: r.type },
        }),
      );
    }

    return { events, errors, orphanedCount };
  },
};
