/**
 * Gate & Movement — the fixed sentences the pass-out / visitation server sends
 * (verdict titles, refusal reasons, approval results), shown in the interface
 * language.
 *
 * The server keeps answering in English (devices, SMS and logs depend on those
 * exact words), so the screens translate by the exact English text. A learner's
 * name and the reason staff typed for a pass are data and pass through as is.
 */
type T = (key: string, vars?: any) => string;

const EXACT: Record<string, string> = {
  'AUTHORIZED': 'title.authorized',
  'NOT AUTHORIZED': 'title.notAuthorized',
  'RETURN RECORDED': 'title.returnRecorded',
  'UNKNOWN VISITATION CARD': 'title.unknownCard',
  'VISIT DENIED': 'title.visitDenied',
  'VISIT ALLOWED': 'title.visitAllowed',
  'ERROR': 'title.error',
  'No active approved pass-out': 'reason.noActivePass',
  'Learner returning': 'reason.returning',
  'Pass-out already used and returned': 'reason.alreadyReturned',
  'Pass-out awaiting approval': 'reason.awaitingApproval',
  'Pass-out expired': 'reason.expired',
  'Approved pass-out': 'reason.approvedPass',
  'A device PIN is required for fingerprint verification': 'reason.pinRequired',
  'Student ID number is required': 'reason.idRequired',
  'student_id is required for manual verification': 'reason.studentRequired',
  'Learner not found in this school': 'reason.notFound',
  'Second approval must come from a different user': 'reason.secondApprover',
  'Pass-out not found': 'reason.passNotFound',
  'Card is not registered': 'reason.cardNotRegistered',
  'Card expired': 'reason.cardExpired',
  'Verified guardian': 'reason.verifiedGuardian',
  'Pass-out approved': 'msg.approved',
  'First approval recorded — awaiting second approver': 'msg.firstApproval',
  'Cannot approve': 'msg.cannotApprove',
  'Request failed': 'msg.requestFailed',
  'Verification failed': 'msg.verificationFailed',
  'Failed': 'msg.failed',
  'Not authenticated': 'msg.notAuthenticated',
  'card_uid is required': 'msg.cardUidRequired',
};

/** A server sentence in the interface language; unknown text (names, typed reasons) unchanged. */
export function gateText(t: T, text: unknown): string {
  const s = String(text ?? '');
  const k = EXACT[s];
  if (k) return t(`gateMovement.server.${k}`);
  let m = /^Card (active|suspended|lost|expired)$/.exec(s);
  if (m) return t('gateMovement.server.reason.cardStatus', { status: t(`gateMovement.cardStatus.${m[1]}`) });
  m = /^Visiting (.+)$/.exec(s);
  if (m) return t('gateMovement.server.reason.visiting', { name: m[1] });
  return s;
}

/** An error to show the user: a known sentence translated, anything else a general message in Arabic. */
export function gateError(t: T, lang: string, text: unknown, fallbackKey = 'msg.failed'): string {
  const s = String(text ?? '');
  const out = s ? gateText(t, s) : '';
  if (out && (out !== s || lang !== 'ar')) return out;
  return t(`gateMovement.server.${fallbackKey}`);
}
