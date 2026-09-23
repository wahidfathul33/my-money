import type * as Sentry from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';
import { scrubFinancialData, scrubSentryEvent } from '../scrubber';

describe('scrubFinancialData', () => {
  it('redacts a value whose key matches a sensitive financial field name', () => {
    const out = scrubFinancialData({ amount: 500_000, walletId: 'w1' });
    expect(out).toEqual({ amount: '[Redacted]', walletId: 'w1' });
  });

  it('redacts nested balance and net worth fields', () => {
    const out = scrubFinancialData({
      wallet: { balance: 10_000_000, name: 'BCA' },
      netWorth: 250_000_000,
    });
    expect(out).toEqual({
      wallet: { balance: '[Redacted]', name: 'BCA' },
      netWorth: '[Redacted]',
    });
  });

  it('redacts household and member name fields', () => {
    const out = scrubFinancialData({ householdName: 'Keluarga Wahid', memberName: 'Istri' });
    expect(out).toEqual({ householdName: '[Redacted]', memberName: '[Redacted]' });
  });

  it('redacts transaction notes and creditor/debtor names', () => {
    const out = scrubFinancialData({ note: 'Bayar cicilan mobil', creditorName: 'Adi' });
    expect(out).toEqual({ note: '[Redacted]', creditorName: '[Redacted]' });
  });

  it('redacts arrays of records element-wise', () => {
    const out = scrubFinancialData([{ amount: 1000 }, { amount: 2000 }]);
    expect(out).toEqual([{ amount: '[Redacted]' }, { amount: '[Redacted]' }]);
  });

  it('leaves non-sensitive fields untouched', () => {
    const out = scrubFinancialData({ transactionId: 'tx1', type: 'expense', userId: 'u1' });
    expect(out).toEqual({ transactionId: 'tx1', type: 'expense', userId: 'u1' });
  });

  it('scrubs Rupiah-formatted amounts embedded in a plain string', () => {
    expect(scrubFinancialData('Saldo Rp10.000.000 tidak cukup')).toBe(
      'Saldo Rp[REDACTED] tidak cukup',
    );
  });

  it('scrubs thousand-separated numbers even without an Rp prefix', () => {
    expect(scrubFinancialData('Gagal memproses 10.000.000')).toBe('Gagal memproses [REDACTED]');
  });

  it('does not touch small numbers, ids, or ordinary text', () => {
    expect(scrubFinancialData('Gagal memuat transaksi #42')).toBe('Gagal memuat transaksi #42');
  });
});

describe('scrubSentryEvent', () => {
  it('scrubs extra, contexts, tags, breadcrumbs, request data, and exception text', () => {
    const event = {
      extra: { amount: 500_000, transactionId: 'tx1' },
      contexts: { wallet: { balance: 1_000_000 } },
      tags: { householdName: 'Keluarga Wahid', route: '/wallets' },
      breadcrumbs: [
        { message: 'Saldo Rp5.000.000 turun', data: { amount: 5_000_000 }, category: 'ui.click' },
      ],
      request: {
        cookies: { session: 'secret-session-token' },
        data: { note: 'Bayar listrik' },
      },
      exception: {
        values: [{ type: 'Error', value: 'Saldo tidak cukup: Rp1.000.000' }],
      },
      message: 'Transfer Rp2.000.000 gagal',
      // Fields that must survive untouched.
      event_id: 'abc123',
      level: 'error',
      platform: 'node',
    } as Sentry.Event;

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.extra).toEqual({ amount: '[Redacted]', transactionId: 'tx1' });
    expect(scrubbed.contexts).toEqual({ wallet: { balance: '[Redacted]' } });
    expect(scrubbed.tags).toEqual({ householdName: '[Redacted]', route: '/wallets' });
    expect(scrubbed.breadcrumbs?.[0]?.message).toBe('Saldo Rp[REDACTED] turun');
    expect(scrubbed.breadcrumbs?.[0]?.data).toEqual({ amount: '[Redacted]' });
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.data).toEqual({ note: '[Redacted]' });
    expect(scrubbed.exception?.values?.[0]?.value).toBe('Saldo tidak cukup: Rp[REDACTED]');
    expect(scrubbed.message).toBe('Transfer Rp[REDACTED] gagal');
    // Technical fields untouched.
    expect(scrubbed.event_id).toBe('abc123');
    expect(scrubbed.level).toBe('error');
    expect(scrubbed.platform).toBe('node');
  });

  it('is a no-op on an event with none of the sensitive sections present', () => {
    const event = { event_id: 'xyz', level: 'warning' } as Sentry.Event;
    expect(scrubSentryEvent(event)).toEqual(event);
  });

  it('fully redacts a WalletNotEligibleError message — it embeds a counterparty name the currency regex cannot catch', () => {
    const event = {
      exception: {
        values: [
          { type: 'WalletNotEligibleError', value: 'Dompet ini tidak dapat dipakai untuk mengirim ke Istri E2E' },
        ],
      },
    } as Sentry.Event;

    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.exception?.values?.[0]?.value).toBe('[Redacted: WalletNotEligibleError]');
    expect(JSON.stringify(scrubbed)).not.toContain('Istri E2E');
  });

  it('fully redacts an OwnerBlockedDeletionError message — it embeds a household name', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'OwnerBlockedDeletionError',
            value: 'Alihkan kepemilikan atau arsipkan "Keluarga Wahid" sebelum menghapus akun',
          },
        ],
      },
    } as Sentry.Event;

    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.exception?.values?.[0]?.value).toBe('[Redacted: OwnerBlockedDeletionError]');
    expect(JSON.stringify(scrubbed)).not.toContain('Keluarga Wahid');
  });

  it('still scrubs OverpaymentError via the currency pattern (not name-bearing, so not on the type denylist)', () => {
    const event = {
      exception: {
        values: [{ type: 'OverpaymentError', value: 'Pembayaran melebihi sisa hutang. Sisa Rp2.500.000.' }],
      },
    } as Sentry.Event;

    const scrubbed = scrubSentryEvent(event);
    // The trailing "." is swallowed into the Rp match (`[\d.,]+` is greedy)
    // — harmless (this string never reaches a user, only Sentry's UI), and
    // the amount itself is gone either way.
    expect(scrubbed.exception?.values?.[0]?.value).toBe('Pembayaran melebihi sisa hutang. Sisa Rp[REDACTED]');
  });
});
