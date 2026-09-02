/**
 * Server-side environment validation — docs/13-deployment-vercel.md §3.
 *
 * Parsed once, lazily, on first access and cached. Failing fast with a
 * message that names only the OFFENDING KEYS (never values) turns a
 * confusing runtime crash three files deep into a one-line startup error.
 *
 * Deviation from docs/12-security-and-auth.md and docs/13-deployment-vercel.md
 * §3: those documents were written against placeholder variable names
 * (`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, `RESEND_API_KEY` for magic link).
 * The real credentials wired up in task 04 use `GOOGLE_CLIENT_ID` /
 * `GOOGLE_CLIENT_SECRET` (an actually-configured Google Cloud OAuth client)
 * and SMTP (a real Gmail account) for the magic-link email provider instead
 * of Resend — see tasks/04-authentication/spec.md task instructions.
 * `RESEND_API_KEY` is kept as an optional variable, reserved for household
 * invitation email in task 10.
 *
 * Never import this from a Client Component — it reads secrets from
 * `process.env` and throws with the raw `process.env` shape on failure. All
 * of its callers are server-only modules (`src/lib/auth/**`,
 * `src/lib/email/**`, `src/lib/services/**`).
 */
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_URL_UNPOOLED: z.string().min(1, 'DATABASE_URL_UNPOOLED is required'),

  // Auth.js
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  AUTH_URL: z.string().url().optional(),

  // Google OAuth — see deviation note above.
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),

  // SMTP — magic-link email transport.
  SMTP_HOST: z.string().min(1, 'SMTP_HOST is required'),
  SMTP_PORT: z.coerce.number().int().positive('SMTP_PORT must be a positive integer'),
  SMTP_USER: z.string().min(1, 'SMTP_USER is required'),
  SMTP_PASSWORD: z.string().min(1, 'SMTP_PASSWORD is required'),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  EMAIL_FROM: z.string().email('EMAIL_FROM must be a valid email address'),

  // Reserved for later tasks; optional here so this module doesn't block
  // this task's build/tests when they're unset.
  CRON_SECRET: z.string().min(32).optional(),
  RESEND_API_KEY: z.string().optional(),
  APP_URL: z.string().url().optional(),
  GOLD_PRICE_PROVIDER: z.enum(['manual', 'external']).optional(),
  GOLD_PRICE_API_URL: z.string().url().optional(),
  GOLD_PRICE_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Validates `process.env` against the schema above, once, and caches the result. */
export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const offendingKeys = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(
      `Invalid or missing environment variables: ${offendingKeys.join(', ')}. ` +
        'Check .env against .env.example — values are never logged.',
    );
  }

  cached = parsed.data;
  return cached;
}
