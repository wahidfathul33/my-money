// @vitest-environment node
/**
 * Integration tests for the onboarding service — real Neon database (see
 * .env, loaded via vitest.config.ts).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { users } from '@/lib/db/schema/users';
import { wallets } from '@/lib/db/schema/wallets';
import { categories } from '@/lib/db/schema/categories';
import { completeOnboarding, seedNewUserAccount } from '../onboarding';
import { NotFoundError } from '@/lib/api/errors';
import { createTestUser, deleteTestUser } from '@/lib/db/__tests__/test-helpers';

describe('seedNewUserAccount', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  it('seeds categories + starter wallet through the service entry point used by the createUser event', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    await seedNewUserAccount(userId);

    const [user] = await dbWrite.select().from(users).where(eq(users.id, userId));
    expect(user?.defaultWalletId).toBeTruthy();

    const seededWallets = await dbWrite.select().from(wallets).where(eq(wallets.userId, userId));
    expect(seededWallets).toHaveLength(1);

    const seededCategories = await dbWrite
      .select()
      .from(categories)
      .where(eq(categories.userId, userId));
    expect(seededCategories).toHaveLength(16);
  });

  it('does not duplicate seed data when invoked twice for the same user', async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    await seedNewUserAccount(userId);
    await seedNewUserAccount(userId);

    const seededWallets = await dbWrite.select().from(wallets).where(eq(wallets.userId, userId));
    expect(seededWallets).toHaveLength(1);
  });
});

describe('completeOnboarding', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) {
      await deleteTestUser(id);
    }
  });

  it('renames the starter wallet, records the opening balance, and sets onboarded_at', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    await seedNewUserAccount(userId);

    await completeOnboarding(userId, {
      walletName: 'BCA',
      walletType: 'bank',
      openingBalance: 500_000_00n,
    });

    const [user] = await dbWrite.select().from(users).where(eq(users.id, userId));
    expect(user?.onboardedAt).not.toBeNull();

    const [wallet] = await dbWrite
      .select()
      .from(wallets)
      .where(eq(wallets.id, user!.defaultWalletId!));
    expect(wallet?.name).toBe('BCA');
    expect(wallet?.type).toBe('bank');
    expect(wallet?.balance).toBe(500_000_00n);
  });

  it('does not write a ledger entry (or change the balance) for a zero opening balance', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    await seedNewUserAccount(userId);

    await completeOnboarding(userId, {
      walletName: 'Tunai',
      walletType: 'cash',
      openingBalance: 0n,
    });

    const [user] = await dbWrite.select().from(users).where(eq(users.id, userId));
    const [wallet] = await dbWrite
      .select()
      .from(wallets)
      .where(eq(wallets.id, user!.defaultWalletId!));
    expect(wallet?.balance).toBe(0n);
  });

  it("never touches another user's wallet — cross-user isolation", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    userIds.push(alice, bob);
    await seedNewUserAccount(alice);
    await seedNewUserAccount(bob);

    const [aliceBefore] = await dbWrite.select().from(users).where(eq(users.id, alice));
    const [aliceWalletBefore] = await dbWrite
      .select()
      .from(wallets)
      .where(eq(wallets.id, aliceBefore!.defaultWalletId!));

    await completeOnboarding(bob, {
      walletName: 'GoPay',
      walletType: 'ewallet',
      openingBalance: 250_000_00n,
    });

    const [aliceAfter] = await dbWrite.select().from(users).where(eq(users.id, alice));
    const [aliceWalletAfter] = await dbWrite
      .select()
      .from(wallets)
      .where(eq(wallets.id, aliceBefore!.defaultWalletId!));

    // Bob's onboarding must be completely invisible to Alice's row and wallet.
    expect(aliceAfter?.onboardedAt).toBe(aliceBefore?.onboardedAt);
    expect(aliceWalletAfter?.name).toBe(aliceWalletBefore?.name);
    expect(aliceWalletAfter?.balance).toBe(aliceWalletBefore?.balance);
  });

  it('throws NotFoundError when the user has no starter wallet (seed never ran)', async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    // Deliberately skip seedNewUserAccount — default_wallet_id stays NULL.

    await expect(
      completeOnboarding(userId, { walletName: 'Tunai', walletType: 'cash', openingBalance: 0n }),
    ).rejects.toThrow(NotFoundError);
  });
});
