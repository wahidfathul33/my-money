// @vitest-environment node
/**
 * Integration tests for the transfers service — real Neon database (see
 * .env, loaded via vitest.config.ts). Same pattern as
 * src/lib/services/__tests__/transactions.integration.test.ts.
 *
 * Covers tasks/08-transfers-self/spec.md's and todo.md's acceptance
 * criteria that can only be proven against a real DB transaction: atomic
 * rollback, idempotency, cross-user isolation, void correctness, the
 * `tx_category_rule`/`ledger_amount_nonzero` CHECKs, and — the ultimate
 * proof — net worth held exactly constant across an arbitrary sequence of
 * transfers (property test).
 *
 * tasks/13-transfers-member extends this file with `createMemberTransfer`
 * and friends — spec.md frames this as "the only operation in the whole app
 * that writes to another person's ledger", so this suite leans hard on:
 * every boundary in spec.md's "Batas yang Harus Dijaga" table, the
 * `tx_created_by_rule` CHECK independent of application code, rollback
 * leaving neither side behind, and I11/I12/I18/I19
 * (src/lib/db/reconcile.ts) staying green through create → acknowledge →
 * move → void.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { and, eq, isNull } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { ledgerEntries, transactions } from '@/lib/db/schema/transactions';
import { wallets } from '@/lib/db/schema/wallets';
import { householdMembers } from '@/lib/db/schema/households';
import { NotFoundError, ValidationError, WalletNotEligibleError } from '@/lib/api/errors';
import {
  findInvalidCreatedByRows,
  findLedgerOwnerMismatches,
  findOneWayTransferLinks,
  findUnbalancedMemberTransfers,
  findWalletBalanceDrift,
} from '@/lib/db/reconcile';
import {
  createTestCategory,
  createTestHouseholdMember,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { getMonthlyTotals } from '@/features/transactions/queries';
import { createTransaction } from '../transactions';
import { archiveWallet } from '../wallets';
import { createHousehold } from '../households';
import {
  acknowledgeTransaction,
  createMemberTransfer,
  createSelfTransfer,
  moveMemberTransferWallet,
  unvoidTransfer,
  voidTransfer,
} from '../transfers';

describe('transfers service', () => {
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

  async function walletBalance(walletId: string): Promise<bigint> {
    const [row] = await dbWrite.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.id, walletId));
    return row?.balance ?? 0n;
  }

  async function liveEntryCount(userId: string): Promise<number> {
    const rows = await dbWrite
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.userId, userId), isNull(ledgerEntries.voidedAt)));
    return rows.length;
  }

  /** Two active members of one fresh household, each with one wallet — the
   * fixture every `createMemberTransfer` test below builds on. `sender`
   * owns the household (irrelevant to the transfer itself — any two active
   * members can send to each other regardless of role). */
  async function setupHouseholdPair() {
    const sender = await createTestUser();
    const receiver = await createTestUser();
    userIds.push(sender, receiver);
    const household = await createHousehold(sender, { name: 'Keluarga Test', timezone: 'Asia/Jakarta' });
    householdIds.push(household.id);
    await createTestHouseholdMember(household.id, receiver, { role: 'member' });
    const senderWallet = await createTestWallet(sender, { name: 'BCA Sender' });
    const receiverWallet = await createTestWallet(receiver, { name: 'BRI Receiver' });
    return { sender, receiver, household: household.id, senderWallet, receiverWallet };
  }

  interface MemberTransferOverrides {
    householdId: string;
    fromWalletId: string;
    counterpartyUserId: string;
    toWalletId: string;
    amount?: bigint;
    note?: string | null;
    idempotencyKey?: string;
  }

  function memberTransferInput(overrides: MemberTransferOverrides) {
    return {
      amount: 1_000_000_00n,
      transactionDate: new Date(),
      note: null,
      idempotencyKey: crypto.randomUUID(),
      ...overrides,
    };
  }

  describe('createSelfTransfer', () => {
    it('moves the balance out of the source wallet and into the destination by the same amount', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });

      await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 500_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(await walletBalance(bca)).toBe(-500_000_00n);
      expect(await walletBalance(gopay)).toBe(500_000_00n);
    });

    it('writes exactly one transactions row (type=transfer, category_id NULL, counterparty_user_id NULL) and two ledger_entries summing to zero', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });

      const row = await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 500_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(row.type).toBe('transfer');
      expect(row.categoryId).toBeNull();
      expect(row.counterpartyUserId).toBeNull();
      expect(row.amount).toBe(500_000_00n); // positive — sign lives on the ledger

      const txRows = await dbWrite.select().from(transactions).where(eq(transactions.id, row.id));
      expect(txRows).toHaveLength(1);

      const entries = await dbWrite.select().from(ledgerEntries).where(eq(ledgerEntries.transactionId, row.id));
      expect(entries).toHaveLength(2);
      const sum = entries.reduce((acc, e) => acc + e.amount, 0n);
      expect(sum).toBe(0n); // invariant I2
      expect(entries.every((e) => e.amount !== 0n)).toBe(true);
    });

    it('rejects an amount that is not positive', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });

      await expect(
        createSelfTransfer(userId, {
          fromWalletId: bca,
          toWalletId: gopay,
          amount: 0n,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects fromWalletId === toWalletId, applying no change', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });

      await expect(
        createSelfTransfer(userId, {
          fromWalletId: bca,
          toWalletId: bca,
          amount: 50_000_00n,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(bca)).toBe(0n);
      expect(await liveEntryCount(userId)).toBe(0);
    });

    it('rejects an archived destination wallet — and rolls back cleanly (zero change to the source)', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });
      await archiveWallet(userId, gopay);

      await expect(
        createSelfTransfer(userId, {
          fromWalletId: bca,
          toWalletId: gopay,
          amount: 50_000_00n,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      // Rollback test: the source wallet's balance is untouched, and no
      // ledger entry from the aborted attempt was left behind.
      expect(await walletBalance(bca)).toBe(0n);
      expect(await liveEntryCount(userId)).toBe(0);
    });

    it('rejects an archived source wallet', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });
      await archiveWallet(userId, bca);

      await expect(
        createSelfTransfer(userId, {
          fromWalletId: bca,
          toWalletId: gopay,
          amount: 50_000_00n,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects a destination wallet that doesn't belong to the caller — cross-user isolation, zero changes", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceWallet = await createTestWallet(alice, { name: 'Alice BCA' });
      const bobWallet = await createTestWallet(bob, { name: 'Bob Tunai' });

      await expect(
        createSelfTransfer(bob, {
          fromWalletId: bobWallet,
          toWalletId: aliceWallet, // Bob attempts to transfer INTO Alice's wallet.
          amount: 50_000_00n,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(bobWallet)).toBe(0n);
      expect(await walletBalance(aliceWallet)).toBe(0n);
      expect(await liveEntryCount(alice)).toBe(0);
      expect(await liveEntryCount(bob)).toBe(0);
    });

    it("rejects a source wallet that doesn't belong to the caller — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const aliceWallet = await createTestWallet(alice, { name: 'Alice BCA' });
      const bobWallet = await createTestWallet(bob, { name: 'Bob Tunai' });

      await expect(
        createSelfTransfer(bob, {
          fromWalletId: aliceWallet, // Bob attempts to transfer FROM Alice's wallet.
          toWalletId: bobWallet,
          amount: 50_000_00n,
          transactionDate: new Date(),
          note: null,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(aliceWallet)).toBe(0n);
    });

    it('is idempotent: the same idempotencyKey twice returns the SAME transfer and moves the balance once', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });
      const idempotencyKey = crypto.randomUUID();

      const first = await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 45_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey,
      });
      const second = await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 45_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey,
      });

      expect(second.id).toBe(first.id);
      expect(await walletBalance(bca)).toBe(-45_000_00n); // moved exactly once
      expect(await walletBalance(gopay)).toBe(45_000_00n);
      expect(await liveEntryCount(userId)).toBe(2); // one pair, not two
    });

    it('never appears in getMonthlyTotals income or expense — docs/03 §9.4', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });
      const category = await createTestCategory(userId, { type: 'expense' });
      const now = new Date();

      await createTransaction(userId, {
        type: 'expense',
        amount: 20_000_00n,
        categoryId: category,
        walletId: bca,
        transactionDate: now,
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 9_999_999_00n, // deliberately huge — would blow up totals if miscounted
        transactionDate: now,
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      const period = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
      const totals = await getMonthlyTotals(userId, period);
      expect(totals.expense).toBe(20_000_00n); // only the real expense — the transfer is invisible here
      expect(totals.income).toBe(0n);
    });
  });

  describe('the DB CHECK itself (tx_category_rule / ledger_amount_nonzero)', () => {
    it('rejects a raw INSERT of a transfer transaction with a non-null category_id, independent of application code', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const category = await createTestCategory(userId, { type: 'expense' });

      await expect(
        dbWrite.insert(transactions).values({
          id: crypto.randomUUID(),
          userId,
          type: 'transfer',
          categoryId: category, // invalid for a transfer — tx_category_rule
          amount: 10_000_00n,
          transactionDate: new Date(),
          createdBy: userId,
        }),
      ).rejects.toThrow();
    });

    it('rejects a raw INSERT of a zero-amount ledger entry, independent of application code', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const walletId = await createTestWallet(userId);

      await expect(
        dbWrite.insert(ledgerEntries).values({
          id: crypto.randomUUID(),
          userId,
          walletId,
          amount: 0n, // ledger_amount_nonzero
          source: 'transaction',
          entryDate: new Date(),
        }),
      ).rejects.toThrow();
    });
  });

  describe('voidTransfer / unvoidTransfer', () => {
    it('void restores BOTH wallets to before the transfer, atomically; unvoid restores it back', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });

      const transfer = await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 500_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(await walletBalance(bca)).toBe(-500_000_00n);
      expect(await walletBalance(gopay)).toBe(500_000_00n);

      await voidTransfer(userId, transfer.id);
      expect(await walletBalance(bca)).toBe(0n);
      expect(await walletBalance(gopay)).toBe(0n);

      await unvoidTransfer(userId, transfer.id);
      expect(await walletBalance(bca)).toBe(-500_000_00n);
      expect(await walletBalance(gopay)).toBe(500_000_00n);
    });

    it("cannot void another user's transfer — cross-user isolation", async () => {
      const alice = await createTestUser();
      const bob = await createTestUser();
      userIds.push(alice, bob);
      const bca = await createTestWallet(alice, { name: 'BCA' });
      const gopay = await createTestWallet(alice, { name: 'GoPay' });
      const transfer = await createSelfTransfer(alice, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 500_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(voidTransfer(bob, transfer.id)).rejects.toThrow(NotFoundError);
      expect(await walletBalance(bca)).toBe(-500_000_00n);
      expect(await walletBalance(gopay)).toBe(500_000_00n);
    });
  });

  describe('reconciliation — wallets.balance always equals SUM(ledger_entries.amount)', () => {
    it('shows zero drift after a sequence of transfer/void/unvoid operations', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const bca = await createTestWallet(userId, { name: 'BCA' });
      const gopay = await createTestWallet(userId, { name: 'GoPay' });
      const cash = await createTestWallet(userId, { name: 'Tunai' });

      const t1 = await createSelfTransfer(userId, {
        fromWalletId: bca,
        toWalletId: gopay,
        amount: 300_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await createSelfTransfer(userId, {
        fromWalletId: gopay,
        toWalletId: cash,
        amount: 100_000_00n,
        transactionDate: new Date(),
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await voidTransfer(userId, t1.id);
      await unvoidTransfer(userId, t1.id);

      const drift = await findWalletBalanceDrift();
      const ourDrift = drift.filter((d) => d.walletId === bca || d.walletId === gopay || d.walletId === cash);
      expect(ourDrift).toHaveLength(0);

      expect(await walletBalance(bca)).toBe(-300_000_00n);
      expect(await walletBalance(gopay)).toBe(200_000_00n);
      expect(await walletBalance(cash)).toBe(100_000_00n);
    });
  });

  describe('property: net worth is unchanged by any sequence of self-transfers', () => {
    // Up to 5 property runs x 5 moves each = up to 25 real dbWrite.transaction
    // round trips to Neon — comfortably exceeds the global 30s testTimeout
    // (vitest.config.ts) under real network conditions, not a hang.
    it('holds for a random sequence of transfers between 3 wallets', async () => {
      const userId = await createTestUser();
      userIds.push(userId);
      const openingBalance = 10_000_000_00n;
      const walletIds = [
        await createTestWallet(userId, { name: 'W1', balance: openingBalance }),
        await createTestWallet(userId, { name: 'W2', balance: 0n }),
        await createTestWallet(userId, { name: 'W3', balance: 0n }),
      ];

      async function netWorth(): Promise<bigint> {
        const rows = await dbWrite
          .select({ balance: wallets.balance })
          .from(wallets)
          .where(eq(wallets.userId, userId));
        return rows.reduce((acc, r) => acc + r.balance, 0n);
      }

      const before = await netWorth();
      expect(before).toBe(openingBalance);

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              fromIndex: fc.integer({ min: 0, max: 2 }),
              toOffset: fc.integer({ min: 1, max: 2 }),
              amount: fc.bigInt({ min: 1n, max: 1_000_00n }),
            }),
            { minLength: 1, maxLength: 5 },
          ),
          async (moves) => {
            for (const move of moves) {
              const fromWalletId = walletIds[move.fromIndex]!;
              const toWalletId = walletIds[(move.fromIndex + move.toOffset) % 3]!;
              await createSelfTransfer(userId, {
                fromWalletId,
                toWalletId,
                amount: move.amount,
                transactionDate: new Date(),
                note: null,
                idempotencyKey: crypto.randomUUID(),
              });
            }
            expect(await netWorth()).toBe(before);
          },
        ),
        { numRuns: 5 }, // real DB round trips per move — kept small deliberately
      );

      expect(await netWorth()).toBe(before);
    }, 90_000);
  });

  describe('createMemberTransfer', () => {
    it('writes 2 transactions + 2 ledger entries + moves both balances, in one dbWrite.transaction', async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();

      const senderRow = await createMemberTransfer(
        sender,
        memberTransferInput({
          householdId: household,
          fromWalletId: senderWallet,
          counterpartyUserId: receiver,
          toWalletId: receiverWallet,
          amount: 1_000_000_00n,
        }),
      );

      expect(senderRow.userId).toBe(sender);
      expect(senderRow.type).toBe('transfer');
      expect(senderRow.categoryId).toBeNull();
      expect(senderRow.counterpartyUserId).toBe(receiver);
      expect(senderRow.createdBy).toBe(sender);
      expect(senderRow.householdId).toBe(household);

      const [receiverRow] = await dbWrite
        .select()
        .from(transactions)
        .where(eq(transactions.linkedTransactionId, senderRow.id));
      expect(receiverRow).toBeDefined();
      expect(receiverRow!.userId).toBe(receiver);
      expect(receiverRow!.counterpartyUserId).toBe(sender);
      // The one legal exception `tx_created_by_rule` permits — the SENDER
      // wrote the receiver's row too.
      expect(receiverRow!.createdBy).toBe(sender);
      expect(receiverRow!.acknowledgedAt).toBeNull();
      expect(receiverRow!.householdId).toBe(household);

      // linked_transaction_id both ways.
      expect(senderRow.linkedTransactionId).toBe(receiverRow!.id);
      expect(receiverRow!.linkedTransactionId).toBe(senderRow.id);

      const allTx = await dbWrite
        .select()
        .from(transactions)
        .where(and(eq(transactions.userId, sender), eq(transactions.type, 'transfer')));
      expect(allTx).toHaveLength(1); // exactly one row for the sender

      const entries = await dbWrite
        .select()
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.transactionId, senderRow.id),
            isNull(ledgerEntries.voidedAt),
          ),
        );
      const receiverEntries = await dbWrite
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.transactionId, receiverRow!.id), isNull(ledgerEntries.voidedAt)));

      expect(entries).toHaveLength(1);
      expect(receiverEntries).toHaveLength(1);
      // ledger_entries.user_id = the WALLET's owner on EACH entry, never the
      // caller — this is what keeps invariant I11 true.
      expect(entries[0]!.userId).toBe(sender);
      expect(entries[0]!.walletId).toBe(senderWallet);
      expect(entries[0]!.amount).toBe(-1_000_000_00n);
      expect(receiverEntries[0]!.userId).toBe(receiver);
      expect(receiverEntries[0]!.walletId).toBe(receiverWallet);
      expect(receiverEntries[0]!.amount).toBe(1_000_000_00n);

      // Both balances updated, seketika (immediately), in the same write.
      expect(await walletBalance(senderWallet)).toBe(-1_000_000_00n);
      expect(await walletBalance(receiverWallet)).toBe(1_000_000_00n);
    });

    it('rejects an amount that is not positive', async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();

      await expect(
        createMemberTransfer(
          sender,
          memberTransferInput({
            householdId: household,
            fromWalletId: senderWallet,
            counterpartyUserId: receiver,
            toWalletId: receiverWallet,
            amount: 0n,
          }),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects counterpartyUserId === userId — cannot member-transfer to yourself', async () => {
      const { sender, household, senderWallet } = await setupHouseholdPair();
      const secondWallet = await createTestWallet(sender, { name: 'GoPay Sender' });

      await expect(
        createMemberTransfer(
          sender,
          memberTransferInput({
            householdId: household,
            fromWalletId: senderWallet,
            counterpartyUserId: sender,
            toWalletId: secondWallet,
          }),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects a fromWalletId that isn't the caller's own — cross-user isolation, zero changes on either side", async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();

      await expect(
        createMemberTransfer(
          sender,
          memberTransferInput({
            householdId: household,
            fromWalletId: receiverWallet, // not the sender's
            counterpartyUserId: receiver,
            toWalletId: receiverWallet,
          }),
        ),
      ).rejects.toThrow(ValidationError);

      expect(await walletBalance(senderWallet)).toBe(0n);
      expect(await walletBalance(receiverWallet)).toBe(0n);
      expect(await liveEntryCount(sender)).toBe(0);
      expect(await liveEntryCount(receiver)).toBe(0);
    });

    it("rejects a destination wallet that doesn't belong to counterpartyUserId — even if it belongs to some OTHER active member", async () => {
      const { sender, receiver, household, senderWallet } = await setupHouseholdPair();
      const outsider = await createTestUser();
      userIds.push(outsider);
      await createTestHouseholdMember(household, outsider, { role: 'member' });
      const outsiderWallet = await createTestWallet(outsider, { name: 'Outsider Wallet' });

      await expect(
        createMemberTransfer(
          sender,
          memberTransferInput({
            householdId: household,
            fromWalletId: senderWallet,
            counterpartyUserId: receiver,
            toWalletId: outsiderWallet, // belongs to a DIFFERENT member, not `receiver`
          }),
        ),
      ).rejects.toThrow(WalletNotEligibleError);

      expect(await walletBalance(senderWallet)).toBe(0n);
      expect(await liveEntryCount(sender)).toBe(0);
    });

    it('rejects a destination wallet that is exclude_from_household — WALLET_NOT_ELIGIBLE', async () => {
      const { sender, receiver, household, senderWallet } = await setupHouseholdPair();
      const excludedWallet = await createTestWallet(receiver, {
        name: 'Dompet Pribadi',
        excludeFromHousehold: true,
      });

      await expect(
        createMemberTransfer(
          sender,
          memberTransferInput({
            householdId: household,
            fromWalletId: senderWallet,
            counterpartyUserId: receiver,
            toWalletId: excludedWallet,
          }),
        ),
      ).rejects.toThrow(WalletNotEligibleError);
    });

    it('rejects a credit card destination wallet — transferring TO one is a bill payment, a different flow', async () => {
      const { sender, receiver, household, senderWallet } = await setupHouseholdPair();
      const ccWallet = await createTestWallet(receiver, { name: 'Kartu Kredit', type: 'credit_card' });

      await expect(
        createMemberTransfer(
          sender,
          memberTransferInput({
            householdId: household,
            fromWalletId: senderWallet,
            counterpartyUserId: receiver,
            toWalletId: ccWallet,
          }),
        ),
      ).rejects.toThrow(WalletNotEligibleError);
    });

    it('rejects an archived destination wallet', async () => {
      const { sender, receiver, household, senderWallet } = await setupHouseholdPair();
      const archivedWallet = await createTestWallet(receiver, { name: 'Lama', isArchived: true });

      await expect(
        createMemberTransfer(
          sender,
          memberTransferInput({
            householdId: household,
            fromWalletId: senderWallet,
            counterpartyUserId: receiver,
            toWalletId: archivedWallet,
          }),
        ),
      ).rejects.toThrow(WalletNotEligibleError);
    });

    it("WALLET_NOT_ELIGIBLE's message names the counterparty — spec.md \"pesan menyebut namanya\"", async () => {
      const sender = await createTestUser();
      const receiver = await createTestUser({ name: 'Istri Test' });
      userIds.push(sender, receiver);
      const household = await createHousehold(sender, { name: 'Keluarga Test', timezone: 'Asia/Jakarta' });
      householdIds.push(household.id);
      await createTestHouseholdMember(household.id, receiver, { role: 'member' });
      const senderWallet = await createTestWallet(sender, { name: 'BCA Sender' });
      const excludedWallet = await createTestWallet(receiver, {
        name: 'Dompet Pribadi',
        excludeFromHousehold: true,
      });

      await expect(
        createMemberTransfer(
          sender,
          memberTransferInput({
            householdId: household.id,
            fromWalletId: senderWallet,
            counterpartyUserId: receiver,
            toWalletId: excludedWallet,
          }),
        ),
      ).rejects.toThrow(/Istri Test/);
    });

    it('rejects when counterpartyUserId is not an active member of householdId at all', async () => {
      const { sender, household, senderWallet } = await setupHouseholdPair();
      const outsider = await createTestUser();
      userIds.push(outsider);
      const outsiderWallet = await createTestWallet(outsider, { name: 'Outsider Wallet' });

      await expect(
        createMemberTransfer(
          sender,
          memberTransferInput({
            householdId: household,
            fromWalletId: senderWallet,
            counterpartyUserId: outsider, // never joined this household
            toWalletId: outsiderWallet,
          }),
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects when the CALLER is not an active member of householdId (e.g. already removed)', async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();
      // Remove the sender's own membership directly (bypassing the service).
      await dbWrite
        .update(householdMembers)
        .set({ status: 'removed' })
        .where(and(eq(householdMembers.householdId, household), eq(householdMembers.userId, sender)));

      await expect(
        createMemberTransfer(
          sender,
          memberTransferInput({
            householdId: household,
            fromWalletId: senderWallet,
            counterpartyUserId: receiver,
            toWalletId: receiverWallet,
          }),
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('rollback: a failure partway through the validation sequence leaves NEITHER side behind', async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();
      await archiveWallet(receiver, receiverWallet); // makes the eligibility check fail, AFTER fromWallet + both memberships already passed

      await expect(
        createMemberTransfer(
          sender,
          memberTransferInput({
            householdId: household,
            fromWalletId: senderWallet,
            counterpartyUserId: receiver,
            toWalletId: receiverWallet,
          }),
        ),
      ).rejects.toThrow(WalletNotEligibleError);

      // Not even the SENDER's own side was left behind.
      expect(await walletBalance(senderWallet)).toBe(0n);
      expect(await walletBalance(receiverWallet)).toBe(0n);
      expect(await liveEntryCount(sender)).toBe(0);
      expect(await liveEntryCount(receiver)).toBe(0);
      const txCount = await dbWrite
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.userId, sender), eq(transactions.type, 'transfer')));
      expect(txCount).toHaveLength(0);
      const receiverTxCount = await dbWrite
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.userId, receiver), eq(transactions.type, 'transfer')));
      expect(receiverTxCount).toHaveLength(0);
    });

    it('is idempotent: the same idempotencyKey twice returns the SAME sender row and moves each balance exactly once', async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();
      const idempotencyKey = crypto.randomUUID();

      const first = await createMemberTransfer(
        sender,
        memberTransferInput({
          householdId: household,
          fromWalletId: senderWallet,
          counterpartyUserId: receiver,
          toWalletId: receiverWallet,
          amount: 250_000_00n,
          idempotencyKey,
        }),
      );
      const second = await createMemberTransfer(
        sender,
        memberTransferInput({
          householdId: household,
          fromWalletId: senderWallet,
          counterpartyUserId: receiver,
          toWalletId: receiverWallet,
          amount: 250_000_00n,
          idempotencyKey,
        }),
      );

      expect(second.id).toBe(first.id);
      expect(await walletBalance(senderWallet)).toBe(-250_000_00n);
      expect(await walletBalance(receiverWallet)).toBe(250_000_00n);
      expect(await liveEntryCount(sender)).toBe(1);
      expect(await liveEntryCount(receiver)).toBe(1);
    });

    it('never appears in getMonthlyTotals income or expense for either side — docs/03 §9.4', async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();
      const category = await createTestCategory(sender, { type: 'expense' });
      const now = new Date();

      await createTransaction(sender, {
        type: 'expense',
        amount: 20_000_00n,
        categoryId: category,
        walletId: senderWallet,
        transactionDate: now,
        note: null,
        idempotencyKey: crypto.randomUUID(),
      });
      await createMemberTransfer(
        sender,
        memberTransferInput({
          householdId: household,
          fromWalletId: senderWallet,
          counterpartyUserId: receiver,
          toWalletId: receiverWallet,
          amount: 9_999_999_00n, // deliberately huge — would blow up totals if miscounted
          idempotencyKey: crypto.randomUUID(),
        }),
      );

      const period = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
      const senderTotals = await getMonthlyTotals(sender, period);
      const receiverTotals = await getMonthlyTotals(receiver, period);
      expect(senderTotals.expense).toBe(20_000_00n);
      expect(senderTotals.income).toBe(0n);
      expect(receiverTotals.income).toBe(0n);
      expect(receiverTotals.expense).toBe(0n);
    });
  });

  describe('the DB CHECK itself (tx_created_by_rule)', () => {
    it('rejects a raw INSERT with created_by <> user_id on anything other than the receiving side of a transfer, independent of application code', async () => {
      const owner = await createTestUser();
      const stranger = await createTestUser();
      userIds.push(owner, stranger);
      const category = await createTestCategory(owner, { type: 'expense' });

      await expect(
        dbWrite.insert(transactions).values({
          id: crypto.randomUUID(),
          userId: owner,
          type: 'expense', // not a transfer — the exception never applies
          categoryId: category,
          amount: 10_000_00n,
          transactionDate: new Date(),
          createdBy: stranger, // invalid: created_by <> user_id
        }),
      ).rejects.toThrow();
    });

    it('rejects a transfer whose created_by is neither its own user_id NOR its counterparty', async () => {
      const owner = await createTestUser();
      const counterparty = await createTestUser();
      const thirdParty = await createTestUser();
      userIds.push(owner, counterparty, thirdParty);

      await expect(
        dbWrite.insert(transactions).values({
          id: crypto.randomUUID(),
          userId: owner,
          type: 'transfer',
          categoryId: null,
          amount: 10_000_00n,
          transactionDate: new Date(),
          counterpartyUserId: counterparty,
          createdBy: thirdParty, // neither owner NOR counterparty wrote this
        }),
      ).rejects.toThrow();
    });

    it('accepts the ONE legal shape the constraint permits: the receiving side of a transfer, created_by = counterparty_user_id', async () => {
      const sender = await createTestUser();
      const receiver = await createTestUser();
      userIds.push(sender, receiver);
      const senderTxId = crypto.randomUUID();
      const receiverTxId = crypto.randomUUID();

      await expect(
        dbWrite.insert(transactions).values([
          {
            id: senderTxId,
            userId: sender,
            type: 'transfer',
            categoryId: null,
            amount: 1000n,
            transactionDate: new Date(),
            counterpartyUserId: receiver,
            linkedTransactionId: receiverTxId,
            createdBy: sender,
          },
          {
            id: receiverTxId,
            userId: receiver,
            type: 'transfer',
            categoryId: null,
            amount: 1000n,
            transactionDate: new Date(),
            counterpartyUserId: sender,
            linkedTransactionId: senderTxId,
            createdBy: sender, // legal: type='transfer' AND counterparty_user_id = created_by
          },
        ]),
      ).resolves.not.toThrow();
    });
  });

  describe('acknowledgeTransaction', () => {
    it("sets acknowledged_at on the RECEIVER's own row", async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();
      const senderRow = await createMemberTransfer(
        sender,
        memberTransferInput({ householdId: household, fromWalletId: senderWallet, counterpartyUserId: receiver, toWalletId: receiverWallet }),
      );
      const [receiverRow] = await dbWrite
        .select()
        .from(transactions)
        .where(eq(transactions.linkedTransactionId, senderRow.id));

      expect(receiverRow!.acknowledgedAt).toBeNull();
      await acknowledgeTransaction(receiver, receiverRow!.id);

      const [after] = await dbWrite.select().from(transactions).where(eq(transactions.id, receiverRow!.id));
      expect(after!.acknowledgedAt).not.toBeNull();
    });

    it('a non-owner (including the sender who wrote the row) cannot acknowledge it', async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();
      const senderRow = await createMemberTransfer(
        sender,
        memberTransferInput({ householdId: household, fromWalletId: senderWallet, counterpartyUserId: receiver, toWalletId: receiverWallet }),
      );
      const [receiverRow] = await dbWrite
        .select()
        .from(transactions)
        .where(eq(transactions.linkedTransactionId, senderRow.id));

      await expect(acknowledgeTransaction(sender, receiverRow!.id)).rejects.toThrow(NotFoundError);
      const [stillUnacknowledged] = await dbWrite.select().from(transactions).where(eq(transactions.id, receiverRow!.id));
      expect(stillUnacknowledged!.acknowledgedAt).toBeNull();
    });
  });

  describe('moveMemberTransferWallet ("Pindahkan")', () => {
    it("moves the receiver's entry to another of the receiver's OWN wallets; balances stay correct", async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();
      const secondReceiverWallet = await createTestWallet(receiver, { name: 'GoPay Receiver' });
      const senderRow = await createMemberTransfer(
        sender,
        memberTransferInput({
          householdId: household,
          fromWalletId: senderWallet,
          counterpartyUserId: receiver,
          toWalletId: receiverWallet,
          amount: 300_000_00n,
        }),
      );
      const [receiverRow] = await dbWrite
        .select()
        .from(transactions)
        .where(eq(transactions.linkedTransactionId, senderRow.id));

      await moveMemberTransferWallet(receiver, receiverRow!.id, secondReceiverWallet);

      expect(await walletBalance(receiverWallet)).toBe(0n); // moved OUT
      expect(await walletBalance(secondReceiverWallet)).toBe(300_000_00n); // moved IN
      expect(await walletBalance(senderWallet)).toBe(-300_000_00n); // sender untouched

      // The link survives a move — only the wallet changed.
      const [afterMove] = await dbWrite.select().from(transactions).where(eq(transactions.id, receiverRow!.id));
      expect(afterMove!.linkedTransactionId).toBe(senderRow.id);
      expect(afterMove!.counterpartyUserId).toBe(sender);
      expect(afterMove!.amount).toBe(300_000_00n);
    });

    it("cannot move the SENDER's side using a wallet the sender doesn't own", async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();
      const senderRow = await createMemberTransfer(
        sender,
        memberTransferInput({ householdId: household, fromWalletId: senderWallet, counterpartyUserId: receiver, toWalletId: receiverWallet }),
      );

      await expect(moveMemberTransferWallet(sender, senderRow.id, receiverWallet)).rejects.toThrow(
        ValidationError,
      );
    });

    it('a non-owner cannot move a side that is not theirs', async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();
      const senderRow = await createMemberTransfer(
        sender,
        memberTransferInput({ householdId: household, fromWalletId: senderWallet, counterpartyUserId: receiver, toWalletId: receiverWallet }),
      );
      const [receiverRow] = await dbWrite
        .select()
        .from(transactions)
        .where(eq(transactions.linkedTransactionId, senderRow.id));
      const anotherSenderWallet = await createTestWallet(sender, { name: 'GoPay Sender' });

      await expect(
        moveMemberTransferWallet(sender, receiverRow!.id, anotherSenderWallet),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('voidTransfer on a member-transfer side ("Hapus")', () => {
    it("void-ing the RECEIVER's side reverses ONLY their balance, unlinks both rows, and leaves the sender's side untouched", async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();
      const senderRow = await createMemberTransfer(
        sender,
        memberTransferInput({
          householdId: household,
          fromWalletId: senderWallet,
          counterpartyUserId: receiver,
          toWalletId: receiverWallet,
          amount: 400_000_00n,
        }),
      );
      const [receiverRow] = await dbWrite
        .select()
        .from(transactions)
        .where(eq(transactions.linkedTransactionId, senderRow.id));

      await voidTransfer(receiver, receiverRow!.id);

      expect(await walletBalance(receiverWallet)).toBe(0n); // reversed
      expect(await walletBalance(senderWallet)).toBe(-400_000_00n); // UNTOUCHED — sender's own record of sending stays true

      const [senderAfter] = await dbWrite.select().from(transactions).where(eq(transactions.id, senderRow.id));
      const [receiverAfter] = await dbWrite.select().from(transactions).where(eq(transactions.id, receiverRow!.id));
      expect(senderAfter!.voidedAt).toBeNull(); // sender's side was never voided
      expect(receiverAfter!.voidedAt).not.toBeNull();
      // Tautan dilepas — dua arah.
      expect(senderAfter!.linkedTransactionId).toBeNull();
      expect(receiverAfter!.linkedTransactionId).toBeNull();
    });

    it("void-ing the SENDER's own side is equally ordinary, and unlinks both rows too", async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();
      const senderRow = await createMemberTransfer(
        sender,
        memberTransferInput({ householdId: household, fromWalletId: senderWallet, counterpartyUserId: receiver, toWalletId: receiverWallet }),
      );
      const [receiverRow] = await dbWrite
        .select()
        .from(transactions)
        .where(eq(transactions.linkedTransactionId, senderRow.id));

      await voidTransfer(sender, senderRow.id);

      expect(await walletBalance(senderWallet)).toBe(0n);
      expect(await walletBalance(receiverWallet)).toBe(1_000_000_00n); // receiver's own record stays true

      const [receiverAfter] = await dbWrite.select().from(transactions).where(eq(transactions.id, receiverRow!.id));
      expect(receiverAfter!.linkedTransactionId).toBeNull();
      expect(receiverAfter!.voidedAt).toBeNull();
    });

    it('a stranger cannot void either side of a member transfer', async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();
      const outsider = await createTestUser();
      userIds.push(outsider);
      const senderRow = await createMemberTransfer(
        sender,
        memberTransferInput({ householdId: household, fromWalletId: senderWallet, counterpartyUserId: receiver, toWalletId: receiverWallet }),
      );
      const [receiverRow] = await dbWrite
        .select()
        .from(transactions)
        .where(eq(transactions.linkedTransactionId, senderRow.id));

      await expect(voidTransfer(outsider, senderRow.id)).rejects.toThrow(NotFoundError);
      await expect(voidTransfer(outsider, receiverRow!.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe('reconciliation — I11/I12/I18/I19 stay green through create -> acknowledge -> move -> void', () => {
    it('reports zero violations, scoped to this test\'s own rows, at every stage', async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();
      const secondReceiverWallet = await createTestWallet(receiver, { name: 'GoPay Receiver' });
      const relevantWallets = new Set([senderWallet, receiverWallet, secondReceiverWallet]);
      const relevantUsers = new Set([sender, receiver]);

      async function assertInvariantsGreen(relevantTxIds: Set<string>) {
        const drift = (await findWalletBalanceDrift()).filter((d) => relevantWallets.has(d.walletId));
        expect(drift).toHaveLength(0); // I1 (sanity — not this task's own invariant, but free to check)

        const ownerMismatches = (await findLedgerOwnerMismatches()).filter(
          (m) => relevantUsers.has(m.entryOwnerId) || relevantUsers.has(m.walletOwnerId),
        );
        expect(ownerMismatches).toHaveLength(0); // I11

        const unbalanced = (await findUnbalancedMemberTransfers()).filter((u) => relevantTxIds.has(u.transactionId));
        expect(unbalanced).toHaveLength(0); // I12

        const oneWay = (await findOneWayTransferLinks()).filter((id) => relevantTxIds.has(id));
        expect(oneWay).toHaveLength(0); // I18

        const invalidCreatedBy = (await findInvalidCreatedByRows()).filter((id) => relevantTxIds.has(id));
        expect(invalidCreatedBy).toHaveLength(0); // I19
      }

      // Stage 1: create.
      const senderRow = await createMemberTransfer(
        sender,
        memberTransferInput({
          householdId: household,
          fromWalletId: senderWallet,
          counterpartyUserId: receiver,
          toWalletId: receiverWallet,
          amount: 777_000_00n,
        }),
      );
      const [receiverRow] = await dbWrite
        .select()
        .from(transactions)
        .where(eq(transactions.linkedTransactionId, senderRow.id));
      const txIds = new Set([senderRow.id, receiverRow!.id]);
      await assertInvariantsGreen(txIds);

      // Stage 2: acknowledge.
      await acknowledgeTransaction(receiver, receiverRow!.id);
      await assertInvariantsGreen(txIds);

      // Stage 3: move.
      await moveMemberTransferWallet(receiver, receiverRow!.id, secondReceiverWallet);
      await assertInvariantsGreen(txIds);

      // Stage 4: void the receiver's side.
      await voidTransfer(receiver, receiverRow!.id);
      await assertInvariantsGreen(txIds);
    });
  });

  describe('property: household wealth is unaffected by a member transfer (it is a wash)', () => {
    it('a single transfer moves sender net worth by exactly -amount and receiver by exactly +amount', async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();

      await createMemberTransfer(
        sender,
        memberTransferInput({
          householdId: household,
          fromWalletId: senderWallet,
          counterpartyUserId: receiver,
          toWalletId: receiverWallet,
          amount: 1_234_500_00n,
        }),
      );

      expect(await walletBalance(senderWallet)).toBe(-1_234_500_00n);
      expect(await walletBalance(receiverWallet)).toBe(1_234_500_00n);
    });

    it('holds for a random sequence of member transfers between the same two people: household sum is invariant', async () => {
      const { sender, receiver, household, senderWallet, receiverWallet } = await setupHouseholdPair();

      async function netWorths() {
        const s = await walletBalance(senderWallet);
        const r = await walletBalance(receiverWallet);
        return { sender: s, receiver: r, sum: s + r };
      }

      const before = await netWorths();
      expect(before.sum).toBe(0n);

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 1n, max: 500_00n }), { minLength: 1, maxLength: 5 }),
          async (amounts) => {
            const preRun = await netWorths();
            let expectedSenderDelta = 0n;
            for (const amount of amounts) {
              await createMemberTransfer(
                sender,
                memberTransferInput({
                  householdId: household,
                  fromWalletId: senderWallet,
                  counterpartyUserId: receiver,
                  toWalletId: receiverWallet,
                  amount,
                  idempotencyKey: crypto.randomUUID(),
                }),
              );
              expectedSenderDelta -= amount;
            }
            const after = await netWorths();
            // Household wealth: unaffected — a wash, every time.
            expect(after.sum).toBe(preRun.sum);
            // Sender −Σamount, receiver +Σamount, exactly.
            expect(after.sender - preRun.sender).toBe(expectedSenderDelta);
            expect(after.receiver - preRun.receiver).toBe(-expectedSenderDelta);
          },
        ),
        { numRuns: 5 }, // real DB round trips per move — kept small deliberately
      );

      const finalState = await netWorths();
      expect(finalState.sum).toBe(before.sum);
    }, 90_000);
  });
});
