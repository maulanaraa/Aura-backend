import { config } from './env.js';

/**
 * Central application settings.
 * Loaded once at boot — fail-fast on invalid env (Stripe-style).
 */
export const appConfig = {
  env: config.NODE_ENV,
  isProduction: config.NODE_ENV === 'production',
  isTest: config.NODE_ENV === 'test',
  port: config.PORT,
  databaseUrl: config.DATABASE_URL,
  directUrl: config.DIRECT_URL ?? config.DATABASE_URL,
  supabase: {
    url: config.SUPABASE_URL,
    serviceRoleKey: config.SUPABASE_SERVICE_ROLE_KEY,
    storageBucket: config.SUPABASE_STORAGE_BUCKET,
    /** True only when both Supabase credentials are present (env.ts enforces they're set together). */
    isConfigured: Boolean(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY),
  },
  frontendUrl: config.FRONTEND_URL.replace(/\/$/, ''),
  email: {
    functionSecret: config.EMAIL_FUNCTION_SECRET,
    fromAddress: config.EMAIL_FROM,
    /** True when secret is present */
    isConfigured: Boolean(config.EMAIL_FUNCTION_SECRET),
  },
  jwt: {
    secret: config.JWT_SECRET,
    accessExpiresIn: config.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: config.JWT_REFRESH_EXPIRES_IN,
  },
  ai: {
    baseUrl: config.AI_SERVICE_URL.replace(/\/$/, ''),
    timeoutMs: config.AI_SERVICE_TIMEOUT_MS,
    predictPath: '/analyze-face',
  },
  gemini: {
    apiKey: config.GEMINI_API_KEY,
    model: config.GEMINI_MODEL,
    timeoutMs: 30_000,
  },
  corsOrigin: config.CORS_ORIGIN,
  rateLimit: {
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX,
  },
  upload: {
    dir: config.UPLOAD_DIR,
    maxBytes: config.MAX_UPLOAD_BYTES,
    publicBaseUrl: config.APP_BASE_URL ?? `http://localhost:${config.PORT}`,
  },
  bcryptRounds: config.BCRYPT_ROUNDS,
  logLevel: config.LOG_LEVEL,
  redisUrl: config.REDIS_URL,
  googleClientId: config.GOOGLE_CLIENT_ID,
  midtrans: {
    serverKey: config.MIDTRANS_SERVER_KEY,
    clientKey: config.MIDTRANS_CLIENT_KEY,
    isProduction: config.MIDTRANS_IS_PRODUCTION,
  },
} as const;

export type AppConfig = typeof appConfig;
