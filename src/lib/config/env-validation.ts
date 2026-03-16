/**
 * Validate required environment variables for DRAIS
 */
export function validateEnvironment() {
  const requiredVars = [
    'DB_HOST',
    'DB_USER',
    'DB_NAME',
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Warn if session cookie secret is not set in production
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.SESSION_COOKIE_SECRET
  ) {
    console.warn('⚠️ SESSION_COOKIE_SECRET is not set. Set it in production for additional security.');
  }
}
