/**
 * Browser Sentry wiring — docs/13-deployment-vercel.md §9, task 23. Next.js
 * 16 file convention (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md,
 * introduced 15.3, superseding the older `sentry.client.config.ts`
 * pattern): runs after the HTML document loads, before React hydrates.
 *
 * Same shared options (and same scrubber) as src/instrumentation.ts so
 * client and server events are held to one policy, not two that can drift.
 *
 * No-op until a real `NEXT_PUBLIC_SENTRY_DSN` is set at deploy time — see
 * src/lib/observability/sentry.ts's doc comment and LAUNCH-CHECKLIST.md.
 */
import * as Sentry from '@sentry/nextjs';
import { sentrySharedOptions } from '@/lib/observability/sentry';

Sentry.init(sentrySharedOptions);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
