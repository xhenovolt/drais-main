import { test, describe, beforeEach, afterEach, expect } from 'node:test';
import { shouldEnforceForcedPasswordReset } from '../src/lib/auth/password-reset-policy';

describe('forced password reset policy', () => {
  const original = process.env.ENFORCE_FORCED_PASSWORD_RESET;

  beforeEach(() => {
    delete process.env.ENFORCE_FORCED_PASSWORD_RESET;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ENFORCE_FORCED_PASSWORD_RESET;
    } else {
      process.env.ENFORCE_FORCED_PASSWORD_RESET = original;
    }
  });

  test('is disabled by default', () => {
    expect(shouldEnforceForcedPasswordReset()).toBe(false);
  });

  test('can be enabled explicitly', () => {
    process.env.ENFORCE_FORCED_PASSWORD_RESET = 'true';
    expect(shouldEnforceForcedPasswordReset()).toBe(true);
  });
});
