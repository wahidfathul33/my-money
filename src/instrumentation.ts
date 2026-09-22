/**
 * Server + edge Sentry wiring — docs/13-deployment-vercel.md §9, task 23.
 * Next.js 16 file convention (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md):
 * `register()` runs once when a new server instance starts, before it
 * accepts requests; `onRequestError` is called for every server-side error
 * Next.js captures (Server Components, Route Handlers, Server Actions).
 *
 * Runtime-specific: the Node and Edge SDKs are different packages under the
 * hood, so `register` dynamically imports the right one, matching Next.js's
 * own documented `NEXT_RUNTIME` pattern.
 *
 * No live Sentry project is connected in this environment —
 * `NEXT_PUBLIC_SENTRY_DSN` is unset, so `Sentry.init` below is a no-op
 * until a real DSN is set in Vercel's environment variables at deploy time
 * (see LAUNCH-CHECKLIST.md's deferred-to-deploy section).
 */
import * as Sentry from '@sentry/nextjs';
import { sentrySharedOptions } from '@/lib/observability/sentry';

export function register(): void {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init(sentrySharedOptions);
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(sentrySharedOptions);
  }
}

export const onRequestError = Sentry.captureRequestError;
