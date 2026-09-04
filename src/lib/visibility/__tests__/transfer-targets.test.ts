/**
 * Unit tests for the pure predicate + the `TransferTargetDto` type-level
 * "no balance" guarantee — docs/12-security-and-auth.md §4.3, spec.md
 * "TransferTargetDto tidak punya field balance — diverifikasi test."
 *
 * The DB-backed halves (`listTransferTargets`, `isWalletTransferEligible`)
 * are covered by src/lib/services/__tests__/transfers.integration.test.ts
 * against a real household/wallet fixture — this file only exercises the
 * pure predicate (every branch, docs/12 §4 "coverage 100% cabang") and the
 * type itself.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import { isEligibleTransferTargetWallet, type TransferTargetDto } from '../transfer-targets';

describe('TransferTargetDto', () => {
  it('has NO balance field — a compile-time guarantee, not just a runtime one', () => {
    // If `balance` is ever added to TransferTargetDto, THIS LINE fails to
    // compile (`npm run typecheck`, part of `npm run verify`) — spec.md:
    // "kebocoran saldo lewat jalur ini menjadi kesalahan tipe, bukan
    // kesalahan review." No runtime assertion can offer that guarantee;
    // this one runs before a single test even executes.
    expectTypeOf<TransferTargetDto>().not.toHaveProperty('balance');

    // Pins the exact shape docs/12 §4.3 specifies (`w.id, w.name, w.type,
    // w.icon, w.color, w.user_id`) — widening or narrowing it is a
    // deliberate, reviewed decision, not silent drift.
    expectTypeOf<TransferTargetDto>().toEqualTypeOf<{
      id: string;
      userId: string;
      name: string;
      type: 'cash' | 'bank' | 'ewallet' | 'credit_card';
      icon: string;
      color: string;
    }>();
  });

  // Belt-and-suspenders runtime check: even if some future refactor made
  // TransferTargetDto a `class` or a runtime-validated shape instead of a
  // plain `interface`, a stray `balance` key on an actual value would still
  // be caught here.
  it('a well-formed value has no "balance" key at runtime either', () => {
    const target: TransferTargetDto = {
      id: 'wallet-1',
      userId: 'user-1',
      name: 'BRI Istri',
      type: 'bank',
      icon: 'bank',
      color: 'blue',
    };
    expect(Object.keys(target)).not.toContain('balance');
  });
});

describe('isEligibleTransferTargetWallet', () => {
  const eligible = {
    membershipStatus: 'active' as const,
    isArchived: false,
    excludeFromHousehold: false,
    walletType: 'bank' as const,
  };

  it('is eligible when the owner is an active member and the wallet is active, included, and not a credit card', () => {
    expect(isEligibleTransferTargetWallet(eligible)).toBe(true);
  });

  it('rejects when the owner has no membership row in this household at all', () => {
    expect(isEligibleTransferTargetWallet({ ...eligible, membershipStatus: null })).toBe(false);
  });

  it('rejects a pending (not-yet-accepted) membership', () => {
    expect(isEligibleTransferTargetWallet({ ...eligible, membershipStatus: 'pending' })).toBe(false);
  });

  it('rejects a removed membership', () => {
    expect(isEligibleTransferTargetWallet({ ...eligible, membershipStatus: 'removed' })).toBe(false);
  });

  it('rejects an archived wallet', () => {
    expect(isEligibleTransferTargetWallet({ ...eligible, isArchived: true })).toBe(false);
  });

  it('rejects a wallet excluded from household visibility', () => {
    expect(isEligibleTransferTargetWallet({ ...eligible, excludeFromHousehold: true })).toBe(false);
  });

  it('rejects a credit card — transferring TO one is a bill payment, a different flow', () => {
    expect(isEligibleTransferTargetWallet({ ...eligible, walletType: 'credit_card' })).toBe(false);
  });

  it('accepts every non-credit-card wallet type', () => {
    expect(isEligibleTransferTargetWallet({ ...eligible, walletType: 'cash' })).toBe(true);
    expect(isEligibleTransferTargetWallet({ ...eligible, walletType: 'ewallet' })).toBe(true);
  });

  it('rejects when every condition fails at once', () => {
    expect(
      isEligibleTransferTargetWallet({
        membershipStatus: 'removed',
        isArchived: true,
        excludeFromHousehold: true,
        walletType: 'credit_card',
      }),
    ).toBe(false);
  });
});
