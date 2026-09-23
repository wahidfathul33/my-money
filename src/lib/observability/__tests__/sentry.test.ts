import { describe, expect, it, vi } from 'vitest';
import type { ReconciliationReport } from '@/lib/db/reconcile';

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
}));

const emptyReport: ReconciliationReport = {
  walletBalanceDrift: [],
  ledgerOwnerMismatches: [],
  unbalancedMemberTransfers: [],
  invalidCreatedByRows: [],
  oneWayTransferLinks: [],
  debtRemainingDrift: [],
  receivableRemainingDrift: [],
  hasFindings: false,
};

describe('reportReconciliationFinding', () => {
  it('does not call Sentry when the report has no findings', async () => {
    const Sentry = await import('@sentry/nextjs');
    const { reportReconciliationFinding } = await import('../sentry');

    reportReconciliationFinding(emptyReport);

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('sends only counts, never drift amounts or wallet names, when findings exist', async () => {
    const Sentry = await import('@sentry/nextjs');
    const { reportReconciliationFinding } = await import('../sentry');

    const report: ReconciliationReport = {
      ...emptyReport,
      hasFindings: true,
      walletBalanceDrift: [
        {
          walletId: 'w1',
          walletName: 'BCA Tabungan',
          cachedBalance: '10000000',
          actualBalance: '9000000',
          drift: '1000000',
        },
      ],
      ledgerOwnerMismatches: [{ ledgerEntryId: 'le1', entryOwnerId: 'u1', walletOwnerId: 'u2' }],
    };

    reportReconciliationFinding(report);

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    const [message, options] = vi.mocked(Sentry.captureMessage).mock.calls[0]!;
    expect(message).toBe('Reconciliation found drift');
    expect(options).toMatchObject({
      level: 'error',
      extra: {
        walletBalanceDriftCount: 1,
        ledgerOwnerMismatchCount: 1,
      },
    });

    const serialized = JSON.stringify(options);
    expect(serialized).not.toContain('10000000');
    expect(serialized).not.toContain('9000000');
    expect(serialized).not.toContain('BCA Tabungan');
  });
});
