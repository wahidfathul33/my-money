import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildSelfTransferEntries } from '../transfer';

describe('buildSelfTransferEntries', () => {
  const base = {
    userId: 'user-1',
    fromWalletId: 'wallet-bca',
    toWalletId: 'wallet-gopay',
    amount: 500_000_00n,
    entryDate: new Date('2026-01-15T00:00:00Z'),
    transactionId: 'tx-1',
  };

  it('produces exactly two entries with opposite signs and the same magnitude', () => {
    const [from, to] = buildSelfTransferEntries(base);

    expect(from.walletId).toBe('wallet-bca');
    expect(from.amount).toBe(-500_000_00n);
    expect(to.walletId).toBe('wallet-gopay');
    expect(to.amount).toBe(500_000_00n);
  });

  it('sums to zero', () => {
    const [from, to] = buildSelfTransferEntries(base);
    expect(from.amount + to.amount).toBe(0n);
  });

  it('both entries share the same userId, transactionId, source, and entryDate', () => {
    const [from, to] = buildSelfTransferEntries(base);

    for (const entry of [from, to]) {
      expect(entry.userId).toBe('user-1');
      expect(entry.transactionId).toBe('tx-1');
      expect(entry.source).toBe('transaction');
      expect(entry.entryDate).toBe(base.entryDate);
    }
  });

  it('property: for any positive amount, the two entries always sum to zero and never share a sign', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 9_999_999_999_999n }), (amount) => {
        const [from, to] = buildSelfTransferEntries({ ...base, amount });
        expect(from.amount + to.amount).toBe(0n);
        expect(from.amount < 0n).toBe(true);
        expect(to.amount > 0n).toBe(true);
        expect(-from.amount).toBe(to.amount);
      }),
    );
  });
});
