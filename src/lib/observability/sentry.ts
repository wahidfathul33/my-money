/**
 * Shared Sentry configuration — one place both src/instrumentation.ts
 * (server + edge) and src/instrumentation-client.ts (browser) pull from, so
 * the scrubber and sampling policy can't drift between runtimes.
 *
 * `NEXT_PUBLIC_SENTRY_DSN` is read directly (not through src/lib/env.ts,
 * which is server-only and validates secrets that don't exist in the
 * browser bundle). A Sentry DSN is a public identifier by design — it's not
 * a credential, so `NEXT_PUBLIC_` exposure is intentional and safe
 * (docs/12-security-and-auth.md §9's secret table does not include it).
 *
 * No live Sentry project is connected in this environment (tasks/23
 * deferred item — see LAUNCH-CHECKLIST.md): `NEXT_PUBLIC_SENTRY_DSN` is
 * unset, so `Sentry.init` runs in no-op mode. The wiring below is what
 * activates the moment a real DSN is set in Vercel's environment variables
 * at deploy time — nothing else changes.
 */
import * as Sentry from '@sentry/nextjs';
import type { ReconciliationReport } from '@/lib/db/reconcile';
import { scrubSentryEvent } from './scrubber';

export function getSentryDsn(): string | undefined {
  return process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
}

/**
 * Shared `Sentry.init()` options. `beforeSend`/`beforeSendTransaction` run
 * the financial-data scrubber (src/lib/observability/scrubber.ts) as the
 * last step before an event leaves the process, regardless of runtime.
 */
export const sentrySharedOptions = {
  dsn: getSentryDsn(),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // Conservative default — full tracing is a cost/volume decision for
  // whoever owns the live Sentry project post-launch, not something to
  // guess at here. 10% is enough to catch systemic slowness without
  // shipping a trace for every request.
  tracesSampleRate: 0.1,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
};

/**
 * Alert 1 of the four defined in docs/13-deployment-vercel.md §9 ("Rekonsiliasi
 * menemukan selisih saldo") — called from `GET /api/cron/reconcile`
 * (src/app/api/cron/reconcile/route.ts) whenever `runReconciliation()`
 * reports any finding.
 *
 * Only COUNTS and opaque row ids are sent, never the drift amounts, cached
 * balances, or wallet names `ReconciliationReport` carries — those exist so
 * a human can run the same query from docs/13 §10's runbook and look at the
 * real numbers inside the app/DB, not so they travel to a third party. The
 * scrubber in `beforeSend` above is a second layer on top of that; this
 * function's job is to not need it in the first place.
 */
export function reportReconciliationFinding(report: ReconciliationReport): void {
  if (!report.hasFindings) return;

  Sentry.captureMessage('Reconciliation found drift', {
    level: 'error',
    tags: { alert: 'reconciliation-drift' },
    extra: {
      walletBalanceDriftCount: report.walletBalanceDrift.length,
      ledgerOwnerMismatchCount: report.ledgerOwnerMismatches.length,
      unbalancedMemberTransferCount: report.unbalancedMemberTransfers.length,
      invalidCreatedByCount: report.invalidCreatedByRows.length,
      oneWayTransferLinkCount: report.oneWayTransferLinks.length,
      debtRemainingDriftCount: report.debtRemainingDrift.length,
      receivableRemainingDriftCount: report.receivableRemainingDrift.length,
    },
  });
}
