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
 * `RESEND_API_KEY` is kept as an optional, unused variable — task 11
 * (household invitation email) reuses the same SMTP/nodemailer transport as
 * magic-link instead of adopting Resend, per its task instructions. `APP_URL`
 * and `CRON_SECRET`, previously optional placeholders "reserved for later
 * tasks", are now required as of task 11 — the first task that actually
 * needs them (building `/invite/[token]` links, and gating
 * `/api/cron/expire-invitations`).
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

  // Bearer secret required by every /api/cron/** route (docs/12 §8) — task
  // 11 is the first to actually gate a route on it (expire-invitations).
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters'),
  // Reserved — task 11 sends invitation email over the same SMTP/nodemailer
  // transport task 04 wired up for magic links (see src/lib/email/invitation.ts),
  // not Resend. Kept optional/unused so a future task adopting Resend
  // doesn't need a schema change.
  RESEND_API_KEY: z.string().optional(),
  // docs/11-tech-architecture.md §8: "untuk membangun tautan undangan" —
  // required as of task 11, which is the first to build a link
  // (`${APP_URL}/invite/${token}`) instead of letting Auth.js infer one.
  APP_URL: z.string().url('APP_URL must be a valid absolute URL'),
  GOLD_PRICE_PROVIDER: z.enum(['manual', 'external']).optional(),
  GOLD_PRICE_API_URL: z.string().url().optional(),
  GOLD_PRICE_API_KEY: z.string().optional(),

  // Task 23 — docs/13-deployment-vercel.md §9. All optional: this
  // environment has no live Sentry project, so `Sentry.init` runs as a
  // documented no-op until a real value is set at deploy time (see
  // src/lib/observability/sentry.ts). `NEXT_PUBLIC_SENTRY_DSN` is read
  // directly from `process.env` by src/instrumentation-client.ts, not
  // through this module (this module is server-only) — listed here anyway
  // so `getEnv()`'s schema documents every env var this app uses in one
  // place, and so a stray non-URL value fails fast in server contexts too.
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  // Build-time only (source map upload in next.config.ts's
  // `withSentryConfig`) — never bundled to the client, never logged.
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
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
