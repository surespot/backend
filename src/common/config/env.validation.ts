const REQUIRED_VARS = [
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_ACCESS_EXPIRY',
  'JWT_REFRESH_EXPIRY',
  'REDIS_HOST',
  'PAYSTACK_SECRET_KEY',
  'NIN_ENCRYPTION_KEY',
  'CORS_ORIGIN',
] as const;

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
}
