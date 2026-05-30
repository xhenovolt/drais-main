/**
 * Dahua adapter — converts Dahua HTTP scrape records into canonical
 * AttendanceEvent[]. Phase 0 audit found two specific defects in the
 * legacy path (src/lib/dahua.ts + src/app/api/attendance/dahua/*):
 *
 *   1. CardNo was assumed to BE the DRAIS person identity (line 122 of
 *      legacy dahua.ts). Real-world Dahua deployments use CardNo as a
 *      separate device-side identity that must be mapped.
 *   2. Method codes were hardcoded in mapMethodToType() with silent
 *      'unknown' fallback — new vendor methods (e.g. iris=99) silently
 *      lost their classification.
 *
 * This adapter:
 *   - Routes CardNo through the central identity resolver — never treats
 *     it as a DRAIS identity directly.
 *   - Maps the documented Dahua method codes to canonical
 *     AttendanceEvent.method values; unknown codes preserve the raw
 *     code in vendorExtras instead of being silently dropped.
 *   - Treats `Type` (Entry/Exit/Pass) as the source of truth for
 *     direction; falls back to options.defaultDirection.
 */

import type { AttendanceAdapter, AttendanceAdapterResult } from '../event';
import { buildEvent, toCanonicalIsoUtc } from '../event';
import type { AttendanceEvent } from '../../types';

interface DahuaRecord {
  RecNo?: number;
  CardNo?: string;          // device-side identity — NOT DRAIS identity
  UserID?: string;          // alternative identity field, vendor-firmware-dependent
  CreateTime?: number | string;
  Method?: number;          // 0=fingerprint, 1=card, 2=password, 3=face, 21=fingerprint
  Type?: string;            // 'Entry' | 'Exit' | 'Pass'
  AttendanceState?: number;
}

interface DahuaPayload {
  vendor: 'dahua';
  deviceSerial: string;
  records: DahuaRecord[];
}

const METHOD_CODE_MAP: Record<number, AttendanceEvent['method']> = {
  0:  'fingerprint',
  1:  'card',
  2:  'password',
  3:  'face',
  21: 'fingerprint',  // alt firmware code per legacy mapping
};

function mapTypeToDirection(type: string | undefined): AttendanceEvent['direction'] {
  if (!type) return 'unknown';
  const t = type.toLowerCase();
  if (t.includes('entry') || t === 'in')  return 'in';
  if (t.includes('exit')  || t === 'out') return 'out';
  return 'unknown';
}

export const dahuaAdapter: AttendanceAdapter<DahuaPayload> = {
  vendor: 'dahua',

  canHandle(payload: unknown): payload is DahuaPayload {
    return (
      typeof payload === 'object'
      && payload !== null
      && (payload as { vendor?: string }).vendor === 'dahua'
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

      const ts = toCanonicalIsoUtc(r.CreateTime);
      if (!ts) {
        errors.push({ locator, message: 'unparseable CreateTime', category: 'timestamp' });
        continue;
      }

      // Prefer UserID when present; many Dahua firmwares emit both.
      const deviceUserId = (r.UserID || r.CardNo || '').toString().trim();
      if (!deviceUserId) {
        errors.push({ locator, message: 'missing UserID/CardNo', category: 'payload' });
        continue;
      }

      const identity = await resolver({
        deviceUserId,
        deviceSerial: payload.deviceSerial,
      });

      if (identity.personId == null || identity.personRole == null) {
        orphanedCount++;
        errors.push({
          locator,
          message: `device user ${deviceUserId} not mapped to any DRAIS person`,
          category: 'identity',
        });
        continue;
      }

      const method = r.Method != null ? METHOD_CODE_MAP[r.Method] : undefined;
      events.push(
        buildEvent({
          personId: identity.personId,
          personRole: identity.personRole,
          timestampUtc: ts,
          direction: mapTypeToDirection(r.Type) || (options?.defaultDirection ?? 'unknown'),
          method: method ?? 'other',
          vendor: 'dahua',
          deviceSerial: payload.deviceSerial,
          deviceUserId,
          rawPayloadRef: options?.rawPayloadRef,
          lateAfterHHMM: options?.lateAfterHHMM,
          // Preserve unknown vendor codes verbatim so investigation is
          // possible later — never silently drop.
          vendorExtras: {
            RecNo: r.RecNo,
            CardNo: r.CardNo,
            UserID: r.UserID,
            AttendanceState: r.AttendanceState,
            rawMethod: r.Method,
            rawType: r.Type,
            ...(method == null && r.Method != null ? { unmappedMethodCode: r.Method } : {}),
          },
        }),
      );
    }

    return { events, errors, orphanedCount };
  },
};
