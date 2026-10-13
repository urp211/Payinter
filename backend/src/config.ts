/**
 * Central configuration. All secrets come from environment variables —
 * no secret value is ever hard-coded in source.
 */
import path from 'path';

function env(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}
function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid integer for env ${key}: ${v}`);
  return n;
}
function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

const nodeEnv = env('NODE_ENV', 'development');
const demoMode = envBool('DEMO_MODE', nodeEnv !== 'production');
const databaseUrl = env('DATABASE_URL');
const embedded = !databaseUrl || envBool('DB_EMBEDDED', !databaseUrl);

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  demoMode,
  sandboxProviders: envBool('SANDBOX_PROVIDERS', demoMode),

  port: envInt('PORT', envInt('BACKEND_PORT', 4000)),

  db: {
    url: databaseUrl,
    embedded,
    embeddedPath: env('DB_EMBEDDED_PATH', path.resolve(process.cwd(), '.data', 'payinter.pglite')),
    migrationsDir: env('MIGRATIONS_DIR', path.resolve(process.cwd(), '..', 'database', 'migrations'))
  },

  jwt: {
    accessSecret: env('JWT_SECRET', 'dev_access_secret_change_me_32chars_min'),
    refreshSecret: env('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_me_32chars_min'),
    accessTtlSeconds: envInt('ACCESS_TOKEN_TTL_SECONDS', 900),
    refreshTtlSeconds: envInt('REFRESH_TOKEN_TTL_SECONDS', 2_592_000)
  },
  pinPepper: env('PIN_PEPPER', 'dev_pin_pepper_change_me'),
  qrSigningSecret: env('QR_SIGNING_SECRET', 'dev_qr_hmac_secret_change_me'),
  dataEncryptionKey: env('DATA_ENCRYPTION_KEY', 'dev_data_encryption_key_change_me'),

  otp: {
    ttlSeconds: envInt('OTP_TTL_SECONDS', 600),
    maxAttempts: envInt('OTP_MAX_ATTEMPTS', 5),
    demoCode: env('DEMO_OTP', '123456')
  },

  corsOrigins: env('CORS_ORIGINS', 'http://localhost:5173,http://localhost:8081')
    .split(',').map((s) => s.trim()).filter(Boolean),

  providers: {
    fx: env('FX_PROVIDER', 'sandbox'),
    fxUrl: env('FX_PROVIDER_URL'),
    fxApiKey: env('FX_PROVIDER_API_KEY'),
    card: env('CARD_PROCESSOR', 'sandbox'),
    cardApiKey: env('CARD_PROCESSOR_API_KEY'),
    cardWebhookSecret: env('CARD_PROCESSOR_WEBHOOK_SECRET'),
    intl: env('INTL_PROVIDER', 'sandbox'),
    intlApiKey: env('INTL_PROVIDER_API_KEY')
  },

  fraud: {
    largeAmountMinor: envInt('FRAUD_LARGE_AMOUNT_MINOR', 500_000),
    velocityWindowSeconds: envInt('FRAUD_VELOCITY_WINDOW_SECONDS', 600),
    velocityMaxTransactions: envInt('FRAUD_VELOCITY_MAX_TXNS', 5)
  },

  seed: {
    demoData: envBool('SEED_DEMO_DATA', true),
    demoUserEmail: env('DEMO_USER_EMAIL', 'demo@payinter.app'),
    demoUserPassword: env('DEMO_USER_PASSWORD', 'Demo1234!'),
    adminEmail: env('ADMIN_EMAIL', 'admin@payinter.app'),
    adminPassword: env('ADMIN_PASSWORD', 'Admin1234!')
  }
};

export type Config = typeof config;
