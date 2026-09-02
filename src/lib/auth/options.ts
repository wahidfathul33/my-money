/**
 * Auth.js v5 configuration — docs/12-security-and-auth.md §1.
 *
 *   Provider   Google OAuth (primary) · magic-link email via SMTP (fallback)
 *   Session    Database (NOT JWT) — instant revocation, see docs/12 §1
 *   Duration   30 days, rolling
 *   Cookie     httpOnly, secure, sameSite=lax, `__Secure-` prefix — ALWAYS,
 *              not just when the deployment happens to be HTTPS. Chrome,
 *              Firefox, and Safari all treat http://localhost as a secure
 *              context, so this doesn't break local dev.
 *
 * `authAdapter` (src/lib/services/auth-adapter.ts) is the only place this
 * module's dependency graph touches `dbWrite` — see that file's doc comment
 * for why a bare `@auth/drizzle-adapter` call over our schema would silently
 * drop every OAuth token field.
 */
import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import { getEnv } from '@/lib/env';
import { authAdapter } from '@/lib/services/auth-adapter';
import { seedNewUserAccount } from '@/lib/services/onboarding';
import { sendMagicLinkEmail } from '@/lib/email/magic-link';

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;

export function buildAuthConfig(): NextAuthConfig {
  const env = getEnv();

  return {
    adapter: authAdapter,
    // Force `__Secure-`/`__Host-` prefixed, `secure: true` cookies in every
    // environment (docs/12 §1) — Auth.js otherwise only turns this on when
    // it infers HTTPS from AUTH_URL/NODE_ENV, which would leave local dev
    // cookies unprefixed.
    useSecureCookies: true,
    trustHost: true,
    secret: env.AUTH_SECRET,
    session: {
      strategy: 'database',
      maxAge: THIRTY_DAYS_IN_SECONDS,
      // Rolling: touching the session mid-life pushes `expires` forward
      // again, up to once per `updateAge` (default 24h) — "30 hari,
      // bergulir" per docs/12 §1.
    },
    pages: {
      signIn: '/signin',
    },
    providers: [
      Google({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      }),
      Nodemailer({
        server: {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
        },
        from: env.EMAIL_FROM,
        sendVerificationRequest: sendMagicLinkEmail,
      }),
    ],
    callbacks: {
      // Layer 1 (docs/12 §3): src/proxy.ts re-exports `auth` as its proxy
      // function. Auth.js calls this for every request the proxy matcher
      // covers (everything except /signin, /invite, /api/auth, /api/cron,
      // _next, favicon.ico — see the matcher there) and, on `false`,
      // redirects to `pages.signIn` with `callbackUrl` set automatically.
      authorized({ auth: session }) {
        return Boolean(session?.user);
      },
      // Database strategy: `user` comes from the adapter, not a JWT payload.
      // Without this, `session.user` has no `id` and `requireUser()`
      // (src/lib/auth/require-user.ts) has nothing to scope queries with.
      session({ session, user }) {
        if (user) {
          session.user.id = user.id;
        }
        return session;
      },
    },
    events: {
      // Fires exactly once, right after the adapter inserts a brand new
      // user row (OAuth first sign-in, or magic-link for an unseen email —
      // see @auth/core's handleLoginOrRegister). This is the "satu
      // transaction, sekali saja" hook required by
      // tasks/04-authentication/spec.md "Seed Pengguna Baru".
      async createUser({ user }) {
        if (user.id) {
          await seedNewUserAccount(user.id);
        }
      },
    },
  };
}
