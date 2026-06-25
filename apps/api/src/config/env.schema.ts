import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters'),

  SESSION_COOKIE_NAME: z.string().default('ecom_sid'),
  SESSION_COOKIE_DOMAIN: z.string().default('localhost'),
  SESSION_COOKIE_SECURE: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  SESSION_MAX_AGE_DAYS: z.coerce.number().int().positive().default(30),
  SESSION_INACTIVITY_MINUTES: z.coerce.number().int().positive().default(30),

  CSRF_SECRET: z.string().min(32),
  CSRF_COOKIE_NAME: z.string().default('ecom_csrf'),

  LOGIN_RATE_LIMIT_IP_MAX: z.coerce.number().int().positive().default(20),
  LOGIN_RATE_LIMIT_IP_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  LOGIN_RATE_LIMIT_USER_MAX: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_LIMIT_USER_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  SEED_ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('Admin#12345'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}
