import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  // Supabase's pooled connection string (port 6543, pgbouncer) — used for
  // normal query traffic at runtime.
  DATABASE_URL: z.string().min(1),
  // Supabase's direct connection string (port 5432, no pgbouncer) — Prisma
  // Migrate needs this because pgbouncer's transaction pooling doesn't
  // support the session-level features migrations rely on. Falls back to
  // DATABASE_URL so a plain (non-Supabase) Postgres instance still works
  // with a single connection string.
  DIRECT_URL: z.string().min(1).optional(),
  // Supabase project settings (Project Settings → API). Only required if
  // you want scan images stored in Supabase Storage — omit both and the
  // app falls back to local disk storage (see shared/services/).
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default('aura-scans'),
  // Public URL of the deployed frontend — used to build links inside
  // transactional emails (e.g. /verify-email?token=...).
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  // Supabase Edge Function that actually sends transactional email (see
  // supabase/functions/send-email). Only required for email verification —
  // omit both to fall back to logging the verification link instead of
  // emailing it (dev/CI only).
  EMAIL_FUNCTION_URL: z.string().url().optional(),
  EMAIL_FUNCTION_SECRET: z.string().min(1).optional(),
  EMAIL_FROM: z.string().default('Aura <onboarding@resend.dev>'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  AI_SERVICE_URL: z.string().url(),
  AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  // Used to generate the AI scan result narrative (RAG-style: grounded in
  // ShadeMapping + matched products, phrased by Gemini). Optional — the
  // narrative gracefully degrades to null (frontend falls back to its own
  // template) when unset, so the app still boots without it.
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  UPLOAD_DIR: z.string().default('uploads'),
  // Only used to build public URLs for the local-disk storage fallback
  // (files served from /uploads). Irrelevant once Supabase Storage is
  // configured, since Supabase returns real public URLs itself.
  APP_BASE_URL: z.string().url().optional(),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  REDIS_URL: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  MIDTRANS_SERVER_KEY: z.string().default('SB-Mid-server-YOUR-KEY'),
  MIDTRANS_CLIENT_KEY: z.string().default('SB-Mid-client-YOUR-KEY'),
  MIDTRANS_IS_PRODUCTION: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
}).refine(
  (env) => Boolean(env.SUPABASE_URL) === Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
  {
    message:
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set together (or both left empty to use local disk storage)',
    path: ['SUPABASE_SERVICE_ROLE_KEY'],
  },
);

export type EnvConfig = z.infer<typeof envSchema>;

function loadConfig(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}

export const config = loadConfig();
