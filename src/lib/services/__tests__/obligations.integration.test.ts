// @vitest-environment node
/**
 * Integration tests for the debts/receivables service — real Neon database
 * (see .env, loaded via vitest.config.ts). Same pattern as
 * src/lib/services/__tests__/savings.integration.test.ts, which this file
 * mirrors closely: the `ledger`-touching invariants, the overpayment
 * ceiling, cross-user isolation, status transitions, idempotency,
 * reconciliation, and the ultimate proof — net worth held exactly constant
 * across an arbitrary sequence of payments (property test) — are all
 * un-provable against a mock, so they live here against the real thing.
 *
 * tasks/18-debts-receivables/spec.md's central claim gets tested from every
 * angle a review would look for: `affects_wallet` gating the ledger entry,
 * the `FOR UPDATE`-guarded overpayment ceiling (including a genuine
 * concurrent race, not just a sequential check), `written_off` rejecting
 * further payment even though `remaining_amount` is deliberately left
 * non-zero, and the CHECK constraint itself independent of application code.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { debtPayments, debts, receivables } from '@/lib/db/schema/obligations';
import { wallets } from '@/lib/db/schema/wallets';
import { ledgerEntries } from '@/lib/db/schema/transactions';
import { NotFoundError, OverpaymentError, ValidationError } from '@/lib/api/errors';
import { findDebtRemainingDrift, findReceivableRemainingDrift, findWalletBalanceDrift } from '@/lib/db/reconcile';
import {
  createTestDebt,
  createTestHouseholdMember,
  createTestUser,
  createTestWallet,
  deleteTestDebt,
  deleteTestHousehold,
  deleteTestReceivable,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { createHousehold } from '../households';
import {
  createDebt,
  createReceivable,
  recordDebtPayment,
  recordReceivablePayment,
  updateDebt,
  updateReceivable,
  voidDebtPayment,
  voidReceivablePayment,
  writeOffDebt,
  writeOffReceivable,
  type CreateDebtInput,
  type CreateReceivableInput,
} from '../obligations';

describe('obligations service', () => {
  const userIds: string[] = [];
  const householdIds: string[] = [];
  const debtIds: string[] = [];
  const receivableIds: string[] = [];

  afterEach(async () => {
    for (const id of debtIds.splice(0)) {
      await deleteTestDebt(id);
    }
    for (const id of receivableIds.splice(0)) {
      await deleteTestReceivable(id);
    }
    for (const id of householdIds.splice(0)) {
      await deleteTestHousehold(id);
    }
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  async function walletBalance(walletId: string): Promise<bigint> {
    const [row] = await dbWrite.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.id, walletId));
    return row?.balance ?? 0n;
  }

  async function debtRow(debtId: string) {
    const [row] = await dbWrite.select().from(debts).where(eq(debts.id, debtId));
    return row;
  }

  async function receivableRow(receivableId: string) {
    const [row] = await dbWrite.select().from(receivables).where(eq(receivables.id, receivableId));
    return row;
  }

  function baseDebtInput(overrides: Partial<CreateDebtInput> = {}): CreateDebtInput {
    return {
      creditorName: 'Bank ABC',
      counterpartyUserId: null,
      initialAmount: 1_000_000_00n,
      startDate: '2026-01-01',
      dueDate: null,
      affectsWallet: false,
      walletId: null,
      note: null,
      ...overrides,
    };
  }

  function baseReceivableInput(overrides: Partial<CreateReceivableInput> = {}): CreateReceivableInput {
    return {
      debtorName: 'Budi',
      counterpartyUserId: null,
      initialAmount: 1_000_000_00n,
      startDate: '2026-01-01',
      dueDate: null,
      affectsWallet: false,
      walletId: null,
      note: null,
      ...overrides,
    };
  }

  describe('createDebt', () => {
    it('affectsWallet=true writes a ledger entry that moves the wallet UP by the full amount', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 0n });

      const debt = await createDebt(userId, baseDebtInput({ affectsWallet: true, walletId, initialAmount: 5_000_000_00n }));
      debtIds.push(debt.id);

      expect(await walletBalance(walletId)).toBe(5_000_000_00n);
      expect(debt.remainingAmount).toBe(5_000_000_00n);
      expect(debt.status).toBe('active');
      expect(debt.walletId).toBe(walletId);

      const [entry] = await dbWrite.select().from(ledgerEntries).where(eq(ledgerEntries.sourceId, debt.id));
      expect(entry?.source).toBe('debt_disbursement');
      expect(entry?.amount).toBe(5_000_000_00n);
    });

    it("affectsWallet=false does NOT write a ledger entry and does NOT touch any wallet — a friend buying something for you never moved cash", async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 1_000_000_00n });

      const debt = await createDebt(userId, baseDebtInput({ affectsWallet: false, walletId: null }));
      debtIds.push(debt.id);

      expect(await walletBalance(walletId)).toBe(1_000_000_00n); // untouched
      expect(debt.walletId).toBeNull();
      const entries = await dbWrite.select().from(ledgerEntries).where(eq(ledgerEntries.sourceId, debt.id));
      expect(entries).toHaveLength(0);
    });

    it('rejects a non-positive initialAmount', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await expect(createDebt(userId, baseDebtInput({ initialAmount: 0n }))).rejects.toThrow(ValidationError);
    });

    it('rejects dueDate before startDate', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await expect(
        createDebt(userId, baseDebtInput({ startDate: '2026-06-01', dueDate: '2026-01-01' })),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects affectsWallet=true with no walletId', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      await expect(createDebt(userId, baseDebtInput({ affectsWallet: true, walletId: null }))).rejects.toThrow(
        ValidationError,
      );
    });

    it("rejects a walletId that isn't the caller's own — cross-user isolation, zero changes", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const bobWallet = await createTestWallet(bob, { balance: 0n });

      await expect(
        createDebt(alice, baseDebtInput({ affectsWallet: true, walletId: bobWallet })),
      ).rejects.toThrow(ValidationError);
      expect(await walletBalance(bobWallet)).toBe(0n);
    });

    it('rejects a counterpartyUserId who is not a fellow household member', async () => {
      const userId = await createTestUser();
      const stranger = await createTestUser();
      userIds.push(userId, stranger);
      await expect(createDebt(userId, baseDebtInput({ counterpartyUserId: stranger }))).rejects.toThrow(
        ValidationError,
      );
    });

    it('accepts a counterpartyUserId who IS a fellow active household member', async () => {
      const userId = await createTestUser();
      const member = await createTestUser();
      userIds.push(userId, member);
      const household = await createHousehold(userId, { name: 'Keluarga', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, member, { role: 'member' });

      const debt = await createDebt(userId, baseDebtInput({ counterpartyUserId: member }));
      debtIds.push(debt.id);
      expect(debt.counterpartyUserId).toBe(member);
    });
  });

  describe('createReceivable', () => {
    it('affectsWallet=true writes a ledger entry that moves the wallet DOWN by the full amount', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 10_000_000_00n });

      const receivable = await createReceivable(
        userId,
        baseReceivableInput({ affectsWallet: true, walletId, initialAmount: 3_000_000_00n }),
      );
      receivableIds.push(receivable.id);

      expect(await walletBalance(walletId)).toBe(7_000_000_00n);
      const [entry] = await dbWrite.select().from(ledgerEntries).where(eq(ledgerEntries.sourceId, receivable.id));
      expect(entry?.source).toBe('receivable_disbursement');
      expect(entry?.amount).toBe(-3_000_000_00n);
    });

    it('affectsWallet=false does not write a ledger entry', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      const receivable = await createReceivable(userId, baseReceivableInput({ affectsWallet: false }));
      receivableIds.push(receivable.id);

      const entries = await dbWrite.select().from(ledgerEntries).where(eq(ledgerEntries.sourceId, receivable.id));
      expect(entries).toHaveLength(0);
    });
  });

  describe('updateDebt / updateReceivable', () => {
    it('allows changing name/amount/dueDate/note before any payment exists', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const debt = await createDebt(userId, baseDebtInput({ initialAmount: 1_000_000_00n }));
      debtIds.push(debt.id);

      const updated = await updateDebt(userId, debt.id, {
        creditorName: 'Bank XYZ',
        counterpartyUserId: null,
        initialAmount: 2_000_000_00n,
        dueDate: '2026-12-31',
        note: 'diubah',
      });

      expect(updated.creditorName).toBe('Bank XYZ');
      expect(updated.initialAmount).toBe(2_000_000_00n);
      expect(updated.remainingAmount).toBe(2_000_000_00n); // no payments yet -> tracks initial exactly
      expect(updated.dueDate).toBe('2026-12-31');
      expect(updated.note).toBe('diubah');
    });

    it('an amount increase on an affectsWallet debt posts a correcting ledger entry and moves the wallet by the delta', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 0n });
      const debt = await createDebt(userId, baseDebtInput({ affectsWallet: true, walletId, initialAmount: 1_000_000_00n }));
      debtIds.push(debt.id);
      expect(await walletBalance(walletId)).toBe(1_000_000_00n);

      const updated = await updateDebt(userId, debt.id, {
        creditorName: debt.creditorName,
        counterpartyUserId: null,
        initialAmount: 1_500_000_00n, // +500rb correction
        dueDate: null,
        note: null,
      });

      expect(updated.remainingAmount).toBe(1_500_000_00n);
      expect(await walletBalance(walletId)).toBe(1_500_000_00n); // moved by exactly the delta
    });

    it('rejects any edit once a payment has been recorded', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 0n });
      const debt = await createDebt(userId, baseDebtInput({ initialAmount: 1_000_000_00n }));
      debtIds.push(debt.id);
      await recordDebtPayment(userId, debt.id, {
        amount: 100_000_00n,
        walletId,
        paymentDate: '2026-01-05',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(
        updateDebt(userId, debt.id, {
          creditorName: 'Nama Baru',
          counterpartyUserId: null,
          initialAmount: 1_000_000_00n,
          dueDate: null,
          note: null,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects updating a debt that belongs to someone else — NotFoundError, not Forbidden", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const debt = await createDebt(alice, baseDebtInput());
      debtIds.push(debt.id);

      await expect(
        updateDebt(bob, debt.id, {
          creditorName: 'Hacked',
          counterpartyUserId: null,
          initialAmount: 1n,
          dueDate: null,
          note: null,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('updateReceivable mirrors updateDebt for the receivable side', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const receivable = await createReceivable(userId, baseReceivableInput({ initialAmount: 1_000_000_00n }));
      receivableIds.push(receivable.id);

      const updated = await updateReceivable(userId, receivable.id, {
        debtorName: 'Budi Santoso',
        counterpartyUserId: null,
        initialAmount: 1_200_000_00n,
        dueDate: '2026-08-01',
        note: null,
      });
      expect(updated.debtorName).toBe('Budi Santoso');
      expect(updated.remainingAmount).toBe(1_200_000_00n);
    });
  });

  describe('recordDebtPayment', () => {
    it('reduces the wallet balance and the remaining amount by exactly the same amount — one transaction', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 5_000_000_00n });
      const debt = await createDebt(userId, baseDebtInput({ initialAmount: 1_000_000_00n }));
      debtIds.push(debt.id);

      const payment = await recordDebtPayment(userId, debt.id, {
        amount: 300_000_00n,
        walletId,
        paymentDate: '2026-01-10',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(await walletBalance(walletId)).toBe(4_700_000_00n);
      const updated = await debtRow(debt.id);
      expect(updated?.remainingAmount).toBe(700_000_00n);
      expect(updated?.status).toBe('partially_paid');

      const [entry] = await dbWrite.select().from(ledgerEntries).where(eq(ledgerEntries.id, payment.ledgerEntryId));
      expect(entry?.source).toBe('debt_payment');
      expect(entry?.amount).toBe(-300_000_00n); // wallet DOWN
      expect(entry?.walletId).toBe(walletId);
    });

    it('MANUAL SANITY CHECK (spec.md): paying an installment reduces wallet balance AND remaining debt by the same amount, and net worth is unchanged — asserted together, not as two separate halves', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 0n });
      const debt = await createDebt(
        userId,
        baseDebtInput({ affectsWallet: true, walletId, initialAmount: 30_000_000_00n, creditorName: 'Adira' }),
      );
      debtIds.push(debt.id);

      const balanceBefore = await walletBalance(walletId);
      const remainingBefore = (await debtRow(debt.id))!.remainingAmount;
      const netWorthBefore = balanceBefore - remainingBefore; // cash minus liability

      await recordDebtPayment(userId, debt.id, {
        amount: 5_000_000_00n,
        walletId,
        paymentDate: '2026-02-01',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      const balanceAfter = await walletBalance(walletId);
      const remainingAfter = (await debtRow(debt.id))!.remainingAmount;
      const netWorthAfter = balanceAfter - remainingAfter;

      expect(balanceAfter).toBe(balanceBefore - 5_000_000_00n); // saldo turun
      expect(remainingAfter).toBe(remainingBefore - 5_000_000_00n); // sisa hutang turun, nominal sama
      expect(netWorthAfter).toBe(netWorthBefore); // net worth TIDAK BERUBAH — diperiksa bersamaan
    });

    it('rejects a payment exceeding the remaining amount with OverpaymentError naming the actual remaining figure', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 10_000_000_00n });
      const debt = await createDebt(userId, baseDebtInput({ initialAmount: 1_000_000_00n }));
      debtIds.push(debt.id);

      const attempt = recordDebtPayment(userId, debt.id, {
        amount: 1_000_000_01n, // one cent over
        walletId,
        paymentDate: '2026-01-10',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await expect(attempt).rejects.toThrow(OverpaymentError);
      await expect(attempt).rejects.toThrow(/Rp1\.000\.000/); // names the actual remaining amount

      expect(await walletBalance(walletId)).toBe(10_000_000_00n); // unchanged
      expect((await debtRow(debt.id))?.remainingAmount).toBe(1_000_000_00n); // unchanged
    });

    it('two concurrent payments cannot jointly exceed the remaining amount — SELECT...FOR UPDATE serializes them', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletA = await createTestWallet(userId, { name: 'A', balance: 10_000_000_00n });
      const walletB = await createTestWallet(userId, { name: 'B', balance: 10_000_000_00n });
      const debt = await createDebt(userId, baseDebtInput({ initialAmount: 1_000_000_00n }));
      debtIds.push(debt.id);

      const results = await Promise.allSettled([
        recordDebtPayment(userId, debt.id, {
          amount: 700_000_00n,
          walletId: walletA,
          paymentDate: '2026-01-10',
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
        recordDebtPayment(userId, debt.id, {
          amount: 700_000_00n,
          walletId: walletB,
          paymentDate: '2026-01-10',
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(OverpaymentError);

      // Exactly one payment's worth applied — never both (which would have
      // driven remaining_amount to -400rb, an impossible state the
      // `debt_remaining_valid` CHECK also independently forbids).
      const updated = await debtRow(debt.id);
      expect(updated?.remainingAmount).toBe(300_000_00n);
      expect(updated?.status).toBe('partially_paid');
    }, 30_000);

    it('status transitions active -> partially_paid -> paid as payments accumulate', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 10_000_000_00n });
      const debt = await createDebt(userId, baseDebtInput({ initialAmount: 1_000_000_00n }));
      debtIds.push(debt.id);
      expect((await debtRow(debt.id))?.status).toBe('active');

      await recordDebtPayment(userId, debt.id, {
        amount: 400_000_00n,
        walletId,
        paymentDate: '2026-01-05',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      expect((await debtRow(debt.id))?.status).toBe('partially_paid');

      await recordDebtPayment(userId, debt.id, {
        amount: 600_000_00n,
        walletId,
        paymentDate: '2026-01-06',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      expect((await debtRow(debt.id))?.status).toBe('paid');
      expect((await debtRow(debt.id))?.remainingAmount).toBe(0n);
    });

    it('rejects a payment against a written_off debt even though remaining_amount is still positive', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 10_000_000_00n });
      const debt = await createDebt(userId, baseDebtInput({ initialAmount: 1_000_000_00n }));
      debtIds.push(debt.id);
      await writeOffDebt(userId, debt.id);
      expect((await debtRow(debt.id))?.remainingAmount).toBe(1_000_000_00n); // deliberately NOT zeroed

      await expect(
        recordDebtPayment(userId, debt.id, {
          amount: 100_00n,
          walletId,
          paymentDate: '2026-01-10',
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);
      expect(await walletBalance(walletId)).toBe(10_000_000_00n); // unchanged
    });

    it('is idempotent: the same idempotencyKey twice returns the SAME payment and moves the balance once', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 10_000_000_00n });
      const debt = await createDebt(userId, baseDebtInput({ initialAmount: 1_000_000_00n }));
      debtIds.push(debt.id);
      const idempotencyKey = crypto.randomUUID();

      const first = await recordDebtPayment(userId, debt.id, {
        amount: 200_000_00n,
        walletId,
        paymentDate: '2026-01-10',
        note: null,
        idempotencyKey,
      });
      const second = await recordDebtPayment(userId, debt.id, {
        amount: 200_000_00n,
        walletId,
        paymentDate: '2026-01-10',
        note: null,
        idempotencyKey,
      });

      expect(second.id).toBe(first.id);
      expect(await walletBalance(walletId)).toBe(9_800_000_00n); // moved once
      expect((await debtRow(debt.id))?.remainingAmount).toBe(800_000_00n);
    });

    it("rejects paying from a wallet that isn't the caller's own — cross-user isolation, zero changes", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const bobWallet = await createTestWallet(bob, { balance: 10_000_000_00n });
      const debt = await createDebt(alice, baseDebtInput({ initialAmount: 1_000_000_00n }));
      debtIds.push(debt.id);

      await expect(
        recordDebtPayment(alice, debt.id, {
          amount: 100_000_00n,
          walletId: bobWallet,
          paymentDate: '2026-01-10',
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(bobWallet)).toBe(10_000_000_00n);
      expect((await debtRow(debt.id))?.remainingAmount).toBe(1_000_000_00n);
    });

    it("rejects paying a debt that belongs to someone else — NotFoundError, not Forbidden", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const bobWallet = await createTestWallet(bob, { balance: 10_000_000_00n });
      const aliceDebt = await createDebt(alice, baseDebtInput({ initialAmount: 1_000_000_00n }));
      debtIds.push(aliceDebt.id);

      await expect(
        recordDebtPayment(bob, aliceDebt.id, {
          amount: 100_000_00n,
          walletId: bobWallet,
          paymentDate: '2026-01-10',
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('recordReceivablePayment — ledger sign reversed from a debt payment', () => {
    it('increases the wallet balance and reduces the remaining amount by the same amount', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 0n });
      const receivable = await createReceivable(userId, baseReceivableInput({ initialAmount: 1_000_000_00n }));
      receivableIds.push(receivable.id);

      const payment = await recordReceivablePayment(userId, receivable.id, {
        amount: 400_000_00n,
        walletId,
        paymentDate: '2026-01-10',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(await walletBalance(walletId)).toBe(400_000_00n); // wallet UP
      expect((await receivableRow(receivable.id))?.remainingAmount).toBe(600_000_00n);

      const [entry] = await dbWrite.select().from(ledgerEntries).where(eq(ledgerEntries.id, payment.ledgerEntryId));
      expect(entry?.source).toBe('receivable_payment');
      expect(entry?.amount).toBe(400_000_00n); // positive — money IN
    });

    it('rejects a payment exceeding the remaining amount with OverpaymentError (piutang wording)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 0n });
      const receivable = await createReceivable(userId, baseReceivableInput({ initialAmount: 500_000_00n }));
      receivableIds.push(receivable.id);

      const attempt = recordReceivablePayment(userId, receivable.id, {
        amount: 600_000_00n,
        walletId,
        paymentDate: '2026-01-10',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await expect(attempt).rejects.toThrow(OverpaymentError);
      await expect(attempt).rejects.toThrow(/sisa piutang/i);
    });

    it('status transitions active -> partially_paid -> paid, same as a debt', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 0n });
      const receivable = await createReceivable(userId, baseReceivableInput({ initialAmount: 500_000_00n }));
      receivableIds.push(receivable.id);

      await recordReceivablePayment(userId, receivable.id, {
        amount: 500_000_00n,
        walletId,
        paymentDate: '2026-01-10',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      expect((await receivableRow(receivable.id))?.status).toBe('paid');
    });
  });

  describe('the DB constraints themselves (debt_remaining_valid / receivable_remaining_valid)', () => {
    it('rejects a raw INSERT of a debt with remaining_amount > initial_amount, independent of application code', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await expect(
        dbWrite.insert(debts).values({
          id: crypto.randomUUID(),
          userId,
          creditorName: 'Invalid',
          initialAmount: 100_00n,
          remainingAmount: 200_00n, // > initial — debt_remaining_valid
          startDate: '2026-01-01',
          affectsWallet: false,
        }),
      ).rejects.toThrow();
    });

    it('rejects a raw UPDATE driving remaining_amount negative, independent of application code', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const debt = await createTestDebt(userId, { initialAmount: 100_00n, remainingAmount: 100_00n });
      debtIds.push(debt);

      await expect(
        dbWrite.update(debts).set({ remainingAmount: -1n }).where(eq(debts.id, debt)),
      ).rejects.toThrow();
    });

    it('rejects a raw INSERT of a receivable with remaining_amount > initial_amount', async () => {
      const userId = await createTestUser();
      userIds.push(userId);

      await expect(
        dbWrite.insert(receivables).values({
          id: crypto.randomUUID(),
          userId,
          debtorName: 'Invalid',
          initialAmount: 100_00n,
          remainingAmount: 200_00n,
          startDate: '2026-01-01',
          affectsWallet: false,
        }),
      ).rejects.toThrow();
    });
  });

  describe('voidDebtPayment / voidReceivablePayment', () => {
    it('reverses the ledger entry, restores remaining_amount, and marks the payment voided', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 1_000_000_00n });
      const debt = await createDebt(userId, baseDebtInput({ initialAmount: 1_000_000_00n }));
      debtIds.push(debt.id);

      const payment = await recordDebtPayment(userId, debt.id, {
        amount: 300_000_00n,
        walletId,
        paymentDate: '2026-01-10',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(await walletBalance(walletId)).toBe(700_000_00n);
      expect((await debtRow(debt.id))?.remainingAmount).toBe(700_000_00n);

      await voidDebtPayment(userId, debt.id, payment.id);

      expect(await walletBalance(walletId)).toBe(1_000_000_00n); // fully reversed
      const afterVoid = await debtRow(debt.id);
      expect(afterVoid?.remainingAmount).toBe(1_000_000_00n);
      expect(afterVoid?.status).toBe('active');

      const [voidedPayment] = await dbWrite.select().from(debtPayments).where(eq(debtPayments.id, payment.id));
      expect(voidedPayment?.voidedAt).not.toBeNull();

      // The ORIGINAL entry is left exactly as it was; a NEW reversing entry
      // was posted instead — docs/05-financial-integrity.md §8.
      const entries = await dbWrite.select().from(ledgerEntries).where(eq(ledgerEntries.sourceId, debt.id));
      expect(entries).toHaveLength(2);
      expect(entries.reduce((sum, e) => sum + e.amount, 0n)).toBe(0n);
    });

    it('voidReceivablePayment mirrors voidDebtPayment for the receivable side', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 0n });
      const receivable = await createReceivable(userId, baseReceivableInput({ initialAmount: 500_000_00n }));
      receivableIds.push(receivable.id);

      const payment = await recordReceivablePayment(userId, receivable.id, {
        amount: 200_000_00n,
        walletId,
        paymentDate: '2026-01-10',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(await walletBalance(walletId)).toBe(200_000_00n);

      await voidReceivablePayment(userId, receivable.id, payment.id);

      expect(await walletBalance(walletId)).toBe(0n);
      expect((await receivableRow(receivable.id))?.remainingAmount).toBe(500_000_00n);
    });

    it('rejects voiding a payment that belongs to a debt owned by someone else', async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const walletId = await createTestWallet(alice, { balance: 1_000_000_00n });
      const debt = await createDebt(alice, baseDebtInput({ initialAmount: 1_000_000_00n }));
      debtIds.push(debt.id);
      const payment = await recordDebtPayment(alice, debt.id, {
        amount: 100_000_00n,
        walletId,
        paymentDate: '2026-01-10',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(voidDebtPayment(bob, debt.id, payment.id)).rejects.toThrow(NotFoundError);
      expect(await walletBalance(walletId)).toBe(900_000_00n); // unchanged
    });
  });

  describe('writeOffDebt / writeOffReceivable', () => {
    it('sets status to written_off without touching remaining_amount, the ledger, or any wallet', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 1_000_000_00n });
      const debt = await createDebt(userId, baseDebtInput({ affectsWallet: true, walletId, initialAmount: 800_000_00n }));
      debtIds.push(debt.id);

      const written = await writeOffDebt(userId, debt.id);

      expect(written.status).toBe('written_off');
      expect(written.remainingAmount).toBe(800_000_00n); // deliberately unchanged
      expect(await walletBalance(walletId)).toBe(1_800_000_00n); // unchanged by the write-off itself (disbursement already happened at creation)
      const entries = await dbWrite.select().from(ledgerEntries).where(eq(ledgerEntries.sourceId, debt.id));
      expect(entries).toHaveLength(1); // only the original disbursement — write-off posts nothing
    });

    it('rejects writing off an already-paid debt', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 1_000_000_00n });
      const debt = await createDebt(userId, baseDebtInput({ initialAmount: 500_000_00n }));
      debtIds.push(debt.id);
      await recordDebtPayment(userId, debt.id, {
        amount: 500_000_00n,
        walletId,
        paymentDate: '2026-01-10',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(writeOffDebt(userId, debt.id)).rejects.toThrow(ValidationError);
    });

    it('rejects writing off an already-written-off debt', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const debt = await createDebt(userId, baseDebtInput({ initialAmount: 500_000_00n }));
      debtIds.push(debt.id);
      await writeOffDebt(userId, debt.id);

      await expect(writeOffDebt(userId, debt.id)).rejects.toThrow(ValidationError);
    });

    it('writeOffReceivable mirrors writeOffDebt', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const receivable = await createReceivable(userId, baseReceivableInput({ initialAmount: 500_000_00n }));
      receivableIds.push(receivable.id);

      const written = await writeOffReceivable(userId, receivable.id);
      expect(written.status).toBe('written_off');
      expect(written.remainingAmount).toBe(500_000_00n);
    });

    it("rejects writing off a debt that belongs to someone else", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const debt = await createDebt(alice, baseDebtInput({ initialAmount: 500_000_00n }));
      debtIds.push(debt.id);

      await expect(writeOffDebt(bob, debt.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe('reconciliation', () => {
    // I4: debt.remaining_amount = initial_amount − SUM(debt_payments.amount WHERE voided_at IS NULL).
    it('shows zero wallet balance drift and zero debt-remaining drift after a sequence of create/pay/void', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 0n });
      const debt = await createDebt(userId, baseDebtInput({ affectsWallet: true, walletId, initialAmount: 2_000_000_00n }));
      debtIds.push(debt.id);

      const p1 = await recordDebtPayment(userId, debt.id, {
        amount: 500_000_00n,
        walletId,
        paymentDate: '2026-01-10',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await recordDebtPayment(userId, debt.id, {
        amount: 300_000_00n,
        walletId,
        paymentDate: '2026-01-15',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await voidDebtPayment(userId, debt.id, p1.id);

      const walletDrift = await findWalletBalanceDrift();
      expect(walletDrift.filter((d) => d.walletId === walletId)).toHaveLength(0);

      const debtDrift = await findDebtRemainingDrift();
      expect(debtDrift.filter((d) => d.obligationId === debt.id)).toHaveLength(0);
    });

    it('shows zero receivable-remaining drift after a sequence of create/pay/void', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 5_000_000_00n });
      const receivable = await createReceivable(
        userId,
        baseReceivableInput({ affectsWallet: true, walletId, initialAmount: 1_000_000_00n }),
      );
      receivableIds.push(receivable.id);

      await recordReceivablePayment(userId, receivable.id, {
        amount: 400_000_00n,
        walletId,
        paymentDate: '2026-01-10',
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      const drift = await findReceivableRemainingDrift();
      expect(drift.filter((d) => d.obligationId === receivable.id)).toHaveLength(0);
    });
  });

  describe('property: paying a debt leaves (wallet balance − debt remaining) unchanged — I8, docs/03 §14.3.4', () => {
    it('holds for a random sequence of payments', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 0n });
      const debt = await createDebt(
        userId,
        baseDebtInput({ affectsWallet: true, walletId, initialAmount: 1_000_000_000_00n }), // large enough to never overpay mid-run
      );
      debtIds.push(debt.id);

      async function netWorthContribution(): Promise<bigint> {
        const balance = await walletBalance(walletId);
        const row = await debtRow(debt.id);
        return balance - (row?.remainingAmount ?? 0n);
      }

      const before = await netWorthContribution();

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 1n, max: 1_000_00n }), { minLength: 1, maxLength: 5 }),
          async (amounts) => {
            for (const amount of amounts) {
              await recordDebtPayment(userId, debt.id, {
                amount,
                walletId,
                paymentDate: '2026-01-10',
                note: null,
                idempotencyKey: crypto.randomUUID(),
              });
            }
            expect(await netWorthContribution()).toBe(before);
          },
        ),
        { numRuns: 5 }, // real DB round trips per move — kept small deliberately
      );

      expect(await netWorthContribution()).toBe(before);
    }, 90_000);
  });

  describe('property: paying a receivable leaves (wallet balance + receivable remaining) unchanged when counted as an asset — the piutang mirror of I8', () => {
    it('holds for a random sequence of payments', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId, { balance: 0n });
      const receivable = await createReceivable(
        userId,
        baseReceivableInput({ affectsWallet: true, walletId, initialAmount: 1_000_000_000_00n }),
      );
      receivableIds.push(receivable.id);

      async function netWorthContribution(): Promise<bigint> {
        const balance = await walletBalance(walletId);
        const row = await receivableRow(receivable.id);
        return balance + (row?.remainingAmount ?? 0n);
      }

      const before = await netWorthContribution();

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 1n, max: 1_000_00n }), { minLength: 1, maxLength: 5 }),
          async (amounts) => {
            for (const amount of amounts) {
              await recordReceivablePayment(userId, receivable.id, {
                amount,
                walletId,
                paymentDate: '2026-01-10',
                note: null,
                idempotencyKey: crypto.randomUUID(),
              });
            }
            expect(await netWorthContribution()).toBe(before);
          },
        ),
        { numRuns: 5 },
      );

      expect(await netWorthContribution()).toBe(before);
    }, 90_000);
  });
});
