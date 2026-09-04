// @vitest-environment node
/**
 * Integration tests for the transfer-target visibility query — real Neon
 * database (see .env, loaded via vitest.config.ts). docs/12-security-and-auth.md
 * §4.3, spec.md's boundary table: "Hanya ke dompet yang boleh dituju |
 * Verifikasi di dalam transaction terhadap query §4.3."
 *
 * The pure predicate (`isEligibleTransferTargetWallet`) is unit-tested,
 * branch by branch, in `transfer-targets.test.ts` — this file proves the TWO
 * real DB-backed call sites (`listTransferTargets` via `dbRead`,
 * `isWalletTransferEligible` via a live `dbWrite.transaction`) apply that
 * SAME predicate against real seeded households/wallets, and that
 * `listTransferTargets`'s actual runtime rows never carry a `balance` key.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { householdMembers } from '@/lib/db/schema/households';
import {
  createTestHouseholdMember,
  createTestUser,
  createTestWallet,
  deleteTestHousehold,
  deleteTestUser,
} from '@/lib/db/__tests__/test-helpers';
import { createHousehold } from '@/lib/services/households';
import { listTransferTargets, isWalletTransferEligible } from '../transfer-targets';

describe('transfer-targets visibility query', () => {
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

  async function setup() {
    const me = await createTestUser();
    const member = await createTestUser();
    userIds.push(me, member);
    const household = await createHousehold(me, { name: 'Keluarga Test', timezone: 'Asia/Jakarta' });
    householdIds.push(household.id);
    await createTestHouseholdMember(household.id, member, { role: 'member' });
    return { me, member, householdId: household.id };
  }

  describe('listTransferTargets', () => {
    it("includes an active member's eligible wallet", async () => {
      const { me, member, householdId } = await setup();
      const eligibleWallet = await createTestWallet(member, { name: 'BRI Istri', type: 'bank' });

      const targets = await listTransferTargets(me, householdId);

      expect(targets.map((t) => t.id)).toContain(eligibleWallet);
      const found = targets.find((t) => t.id === eligibleWallet)!;
      expect(found.userId).toBe(member);
      expect(found.name).toBe('BRI Istri');
      expect(found.type).toBe('bank');
    });

    it('excludes the CALLER\'s own wallets — this is a "pick someone else" list', async () => {
      const { me, householdId } = await setup();
      const myOwnWallet = await createTestWallet(me, { name: 'BCA Saya' });

      const targets = await listTransferTargets(me, householdId);

      expect(targets.map((t) => t.id)).not.toContain(myOwnWallet);
    });

    it('excludes an archived wallet', async () => {
      const { me, member, householdId } = await setup();
      const archived = await createTestWallet(member, { name: 'Lama', isArchived: true });

      const targets = await listTransferTargets(me, householdId);

      expect(targets.map((t) => t.id)).not.toContain(archived);
    });

    it('excludes a wallet marked exclude_from_household', async () => {
      const { me, member, householdId } = await setup();
      const excluded = await createTestWallet(member, { name: 'Pribadi', excludeFromHousehold: true });

      const targets = await listTransferTargets(me, householdId);

      expect(targets.map((t) => t.id)).not.toContain(excluded);
    });

    it('excludes a credit card wallet', async () => {
      const { me, member, householdId } = await setup();
      const cc = await createTestWallet(member, { name: 'Kartu Kredit', type: 'credit_card' });

      const targets = await listTransferTargets(me, householdId);

      expect(targets.map((t) => t.id)).not.toContain(cc);
    });

    it("excludes a REMOVED member's wallet, even though the row still exists", async () => {
      const { me, member, householdId } = await setup();
      const wallet = await createTestWallet(member, { name: 'Sudah Keluar' });
      await dbWrite
        .update(householdMembers)
        .set({ status: 'removed' })
        .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, member)));

      const targets = await listTransferTargets(me, householdId);

      expect(targets.map((t) => t.id)).not.toContain(wallet);
    });

    it('every returned row has NO balance key at runtime', async () => {
      const { me, member, householdId } = await setup();
      await createTestWallet(member, { name: 'BRI Istri' });

      const targets = await listTransferTargets(me, householdId);

      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        expect(Object.keys(target)).not.toContain('balance');
      }
    });
  });

  describe('isWalletTransferEligible (the in-transaction re-check)', () => {
    it('returns true for an eligible wallet', async () => {
      const { member, householdId } = await setup();
      const wallet = await createTestWallet(member, { name: 'BRI Istri' });

      const eligible = await dbWrite.transaction((tx) =>
        isWalletTransferEligible(tx, { walletId: wallet, counterpartyUserId: member, householdId }),
      );

      expect(eligible).toBe(true);
    });

    it("returns false when the wallet doesn't belong to counterpartyUserId", async () => {
      const { me, member, householdId } = await setup();
      const myWallet = await createTestWallet(me, { name: 'Punya Saya' });

      const eligible = await dbWrite.transaction((tx) =>
        isWalletTransferEligible(tx, { walletId: myWallet, counterpartyUserId: member, householdId }),
      );

      expect(eligible).toBe(false);
    });

    it('returns false for exclude_from_household', async () => {
      const { member, householdId } = await setup();
      const wallet = await createTestWallet(member, { name: 'Pribadi', excludeFromHousehold: true });

      const eligible = await dbWrite.transaction((tx) =>
        isWalletTransferEligible(tx, { walletId: wallet, counterpartyUserId: member, householdId }),
      );

      expect(eligible).toBe(false);
    });

    it('returns false for a credit card', async () => {
      const { member, householdId } = await setup();
      const wallet = await createTestWallet(member, { name: 'Kartu Kredit', type: 'credit_card' });

      const eligible = await dbWrite.transaction((tx) =>
        isWalletTransferEligible(tx, { walletId: wallet, counterpartyUserId: member, householdId }),
      );

      expect(eligible).toBe(false);
    });

    it('returns false for a nonexistent wallet id', async () => {
      const { member, householdId } = await setup();

      const eligible = await dbWrite.transaction((tx) =>
        isWalletTransferEligible(tx, {
          walletId: crypto.randomUUID(),
          counterpartyUserId: member,
          householdId,
        }),
      );

      expect(eligible).toBe(false);
    });
  });
});
