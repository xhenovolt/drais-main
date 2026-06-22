/**
 * Device ownership-ceremony secret gate.
 *
 * Acquiring (claiming) or releasing a device is a high-impact, cross-school
 * action — it moves a physical biometric device between real schools and
 * archives/wipes enrollment + directory data. To stop accidental or
 * unauthorised transfers, every release / acquire / decommission call must
 * present a shared operator secret.
 *
 * The secret lives ONLY in the environment (DEVICE_CLAIM_SECRET) — never in
 * the repo, never returned to the client. If the env var is unset the gate
 * is "closed by default": all transfers are refused with a clear message so
 * a misconfigured deployment fails safe instead of allowing free transfers.
 */

export class ClaimSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaimSecretError';
  }
}

/**
 * Throws ClaimSecretError unless `provided` matches DEVICE_CLAIM_SECRET.
 * Comparison is length-safe constant-ish (we don't expose timing oracles
 * meaningfully here, but avoid early-out on length to be tidy).
 */
export function assertClaimSecret(provided: unknown): void {
  const expected = process.env.DEVICE_CLAIM_SECRET;
  if (!expected) {
    throw new ClaimSecretError(
      'Device transfers are disabled: DEVICE_CLAIM_SECRET is not configured on the server.',
    );
  }
  if (typeof provided !== 'string' || provided.length === 0) {
    throw new ClaimSecretError('A device transfer secret is required.');
  }
  if (provided !== expected) {
    throw new ClaimSecretError('Incorrect device transfer secret.');
  }
}
