/**
 * Stable TypeScript contracts for the DRAIS Platform API v1.
 *
 * External consumers (JETON, future Xhenvolt systems) should copy these
 * types or import from a published @drais/platform-client package once one
 * exists. Until then this file is the canonical schema.
 *
 * Backwards-compatibility rules for v1:
 *   - Fields may be ADDED to responses.
 *   - Fields will NOT be removed or have their type narrowed.
 *   - Error codes will NOT be repurposed.
 *   - Enum values may be ADDED; consumers MUST tolerate unknown values.
 *   - Breaking changes ship as /api/platform/v2 alongside v1.
 */

export type SchoolStatus = 'active' | 'suspended' | 'pending';
export type SubscriptionStatus = 'active' | 'inactive' | 'trial' | 'expired';
export type SubscriptionPlan   = 'none' | 'trial' | 'monthly' | 'yearly';

export type PlatformConsumer =
  | 'jeton' | 'xhaira' | 'consty' | 'jorc' | 'xheton' | 'internal_ops' | (string & {});

export interface PlatformEnvelopeOk<T>   { success: true;  data: T }
export interface PlatformEnvelopeErr     { success: false; error: PlatformErrorBody }
export type PlatformResponse<T> = PlatformEnvelopeOk<T> | PlatformEnvelopeErr;

export interface PlatformErrorBody {
  code:    PlatformErrorCode;
  message: string;
  details?: unknown;
}

export type PlatformErrorCode =
  | 'UNAUTHORIZED'
  | 'KEY_REVOKED'
  | 'KEY_EXPIRED'
  | 'IP_NOT_ALLOWED'
  | 'INSUFFICIENT_SCOPE'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'SERVER_MISCONFIGURATION';

export interface Paginated<T> {
  items:       T[];
  next_cursor: number | null;
  limit:       number;
}

export interface PlatformSchool {
  external_id:             string;
  name:                    string;
  email:                   string | null;
  phone:                   string | null;
  status:                  SchoolStatus;
  subscription_status:     SubscriptionStatus | null;
  subscription_plan:       SubscriptionPlan | null;
  trial_start_date?:        string | null;
  trial_end_date?:          string | null;
  subscription_start_date?: string | null;
  subscription_end_date?:   string | null;
  created_at:              string;
  updated_at:              string;
}

export interface PlatformSubscription {
  external_id:             string;
  subscription_status:     SubscriptionStatus | null;
  subscription_plan:       SubscriptionPlan | null;
  trial_start_date:        string | null;
  trial_end_date:          string | null;
  subscription_start_date: string | null;
  subscription_end_date:   string | null;
}

export interface PlatformUsage {
  school:            string; // external_id or 'platform'
  window_days:       number;
  learners:          number;
  staff:             number;
  sms_sent:          number;
  sms_sent_24h:      number;
  active_sessions:   number;
  api_payload_bytes: number;
}

export interface PlatformAnalytics {
  tenants: {
    total: number; active: number; suspended: number; trial: number; expired: number;
  };
  growth_12_months:   Array<{ month: string; new_schools: number }>;
  subscription_plans: Array<{ plan: string; count: number }>;
  sms_30d:            number;
  active_tenants_7d:  number;
  generated_at:       string;
}

export type PlatformEventType =
  | 'school.created' | 'school.updated' | 'school.suspended' | 'school.reactivated' | 'school.deleted'
  | 'subscription.changed' | 'subscription.expiring' | 'subscription.expired'
  | 'payment.received' | 'sms.balance.low' | 'learner.limit.exceeded' | 'tenant.health.degraded'
  | (string & {});

export interface PlatformEventRecord<T = unknown> {
  id:         number;
  event_type: PlatformEventType;
  school_id:  number | null; // numeric internal id is opaque-on-purpose; correlate via payload.external_id
  payload:    T;
  emitted_at: string;
}

export interface WebhookSubscription {
  id:               number;
  consumer:         PlatformConsumer;
  url:              string;
  event_types:      PlatformEventType[];
  is_active:        boolean;
  last_delivery_at: string | null;
  last_status:      string | null;
  created_at:       string;
  /** Returned ONLY on POST /webhooks — never on GET. */
  secret?:          string;
}

export interface PlatformOpsMetrics {
  window_minutes:       number;
  total_requests:       number;
  auth_failures:        number;
  scope_denials:        number;
  rate_limited:         number;
  server_errors:        number;
  avg_response_ms:      number | null;
  p95_response_ms:      number | null;
  webhook_pending:      number;
  webhook_failed_24h:   number;
  webhook_dead_24h:     number;
}
