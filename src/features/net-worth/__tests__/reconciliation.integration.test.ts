// @vitest-environment node
/**
 * tasks/19-net-worth todo.md: "Integration: jalankan job rekonsiliasi — 0
 * selisih di seluruh modul." spec.md's own framing: "Task ini adalah
 * tempat setiap invarian anti-double-count diuji bersamaan. Kalau ada satu
 * modul sebelumnya yang menghitung uang dua kali, di sinilah ia terlihat."
 *
 * Unlike src/lib/db/__tests__/reconcile.integration.test.ts's fixtures
 * (hand-built `postEntries` calls), this test drives data through the REAL
 * service functions of every module net worth touches — savings, gold,
 * deposits, debts, and a member transfer — the same code paths a real user
 * exercises. Then it runs BOTH `runReconciliation()` (the ledger-level
 * invariants) AND `getNetWorth`/`getHouseholdNetWorth` (this task's own
 * aggregation), so a bug in either layer would surface here.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { dbWrite } from '@/lib/db/write';
import { postEntries } from '@/lib/finance/ledger';
import { runReconciliation } from '@/lib/db/reconcile';
import { buyGold } from '@/lib/services/gold';
import { createGoal, contribute } from '@/lib/services/savings';
import { createDeposit } from '@/lib/services/deposits';
import { createDebt, recordDebtPayment } from '@/lib/services/obligations';
import { createMemberTransfer } from '@/lib/services/transfers';
import {
  createTestHousehold,
  createTestHouseholdMember,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { getHouseholdNetWorth, getNetWorth } from '../queries';

describe('net worth reconciliation — every module together', () => {
  const userIds: string[] = [];
  const householdIds: string[] = [];

  afterEach(async () => {
    for (const id of householdIds.splice(0)) {
      await deleteTestHousehold(id);
    }
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  it('reports zero drift after a realistic mix of income, savings, gold, deposit, debt, and a member transfer', async () => {
    const sender = await createTestUser();
    const receiver = await createTestUser();
    userIds.push(sender, receiver);

    const householdId = await createTestHousehold(sender);
    householdIds.push(householdId);
    await createTestHouseholdMember(householdId, receiver, { status: 'active', shareWealth: true });
    // `createTestHousehold` inserts the `households` row directly (bypassing
    // the real create-household service), so it does NOT also seed the
    // creator's own `household_members` row the way that service would —
    // add it here, sharing wealth, so the sender is part of the roster too.
    await createTestHouseholdMember(householdId, sender, { role: 'owner', status: 'active', shareWealth: true });

    const senderWallet = await createTestWallet(sender, { name: 'Kas Sender' });
    const receiverWallet = await createTestWallet(receiver, { name: 'Kas Receiver' });

    // 1. Income — Rp20.000.000 lands in the sender's wallet.
    await dbWrite.transaction(async (tx) => {
      await postEntries(tx, [
        { userId: sender, walletId: senderWallet, amount: 20_000_000_00n, source: 'adjustment', entryDate: new Date() },
      ]);
    });

    // 2. Savings contribution — Rp3.000.000 moves cash -> savings (I8: net worth unchanged).
    const goal = await createGoal(sender, { name: 'Dana Darurat', targetAmount: 50_000_000_00n, targetDate: null, householdId: null });
    await contribute(sender, goal.id, {
      walletId: senderWallet,
      amount: 3_000_000_00n,
      contributionDate: new Date(),
      note: null,
      idempotencyKey: 'recon-test-contribute-1',
    });

    // 3. Gold purchase — Rp2.000.000 moves cash -> gold lot cost basis.
    await buyGold(sender, {
      weightGrams: '2.0000',
      pricePerGram: 1_000_000_00n,
      walletId: senderWallet,
      purchaseDate: new Date(),
      goldForm: 'Antam',
      idempotencyKey: 'recon-test-gold-1',
    });

    // 4. Deposit — Rp5.000.000 moves cash -> deposit principal.
    await createDeposit(sender, {
      bankName: 'Bank Uji',
      principal: 5_000_000_00n,
      interestRateAnnual: '4.0000',
      startDate: '2026-01-01',
      maturityDate: '2027-01-01',
      payoutSchedule: 'at_maturity',
      aroEnabled: false,
      aroIncludeInterest: false,
      walletId: senderWallet,
      idempotencyKey: 'recon-test-deposit-1',
    });

    // 5. Debt — borrowing Rp1.000.000 moves cash UP and creates a liability.
    const debt = await createDebt(sender, {
      creditorName: 'Kreditor Uji',
      counterpartyUserId: null,
      initialAmount: 1_000_000_00n,
      startDate: '2026-01-01',
      dueDate: null,
      affectsWallet: true,
      walletId: senderWallet,
      note: null,
    });
    // Partial payment — Rp400.000 moves cash DOWN and the remaining debt DOWN by the same amount (I8).
    await recordDebtPayment(sender, debt.id, {
      amount: 400_000_00n,
      walletId: senderWallet,
      paymentDate: '2026-02-01',
      note: null,
      idempotencyKey: 'recon-test-debt-payment-1',
    });

    // 6. Member transfer — Rp1.500.000 moves from sender to receiver
    // (I13: household total unaffected; both share_wealth).
    await createMemberTransfer(sender, {
      householdId,
      fromWalletId: senderWallet,
      counterpartyUserId: receiver,
      toWalletId: receiverWallet,
      amount: 1_500_000_00n,
      transactionDate: new Date(),
      note: null,
      idempotencyKey: 'recon-test-member-transfer-1',
    });

    // --- Reconciliation: zero drift across every ledger-level invariant ---
    const report = await runReconciliation();
    const relevantWalletIds = new Set([senderWallet, receiverWallet]);
    expect(report.walletBalanceDrift.filter((d) => relevantWalletIds.has(d.walletId))).toHaveLength(0);
    expect(report.ledgerOwnerMismatches).toHaveLength(0);
    expect(report.unbalancedMemberTransfers).toHaveLength(0);
    expect(report.invalidCreatedByRows).toHaveLength(0);
    expect(report.oneWayTransferLinks).toHaveLength(0);
    expect(report.debtRemainingDrift.filter((d) => d.obligationId === debt.id)).toHaveLength(0);

    // --- This task's own aggregation: every module reflected, exactly once ---
    const senderNetWorth = await getNetWorth(sender);
    // Cash: 20.000.000 + 1.000.000 (debt) − 3.000.000 (savings) − 2.000.000
    // (gold) − 5.000.000 (deposit) − 400.000 (debt payment) − 1.500.000
    // (transferred out) = 9.100.000.
    expect(senderNetWorth.breakdown.assets.cash).toBe(9_100_000_00n);
    expect(senderNetWorth.breakdown.assets.savings).toBe(3_000_000_00n);
    expect(senderNetWorth.breakdown.assets.gold).toBe(0n); // no price recorded -> valuation hidden, not fabricated
    expect(senderNetWorth.breakdown.assets.deposits).toBe(5_000_000_00n);
    expect(senderNetWorth.breakdown.liabilities.debts).toBe(600_000_00n); // 1.000.000 − 400.000

    const receiverNetWorth = await getNetWorth(receiver);
    expect(receiverNetWorth.breakdown.assets.cash).toBe(1_500_000_00n);

    // Household total: both members share, so it's exactly the sum of
    // their two personal figures — the transfer moved money BETWEEN them,
    // never in or out of the household as a whole (I13, live end to end).
    const household = await getHouseholdNetWorth(householdId);
    expect(household.coverage).toEqual({ memberCount: 2, contributingCount: 2 });
    expect(household.totals.netWorth).toBe(senderNetWorth.netWorth + receiverNetWorth.netWorth);
  });
});
