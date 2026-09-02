/**
 * Onboarding orchestration — dbWrite transactions live here, per
 * docs/11-tech-architecture.md §3 (only src/lib/services/** may import
 * `@/lib/db/write`).
 */
import { and, eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { users, wallets } from '@/lib/db/schema';
import { seedNewUser } from '@/lib/db/seed';
import { postEntries } from '@/lib/finance/ledger';
import { NotFoundError } from '@/lib/api/errors';
import type { Money } from '@/lib/finance/money';

/**
 * Fired from Auth.js's `createUser` adapter event (src/lib/auth/options.ts)
 * — exactly once per new user, the moment their row is first inserted.
 * Opens the one transaction that seeds their categories + starter wallet
 * (docs/03-domain-model.md §7, tasks/04-authentication/spec.md "Seed
 * Pengguna Baru").
 */
export async function seedNewUserAccount(userId: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    await seedNewUser(tx, userId);
  });
}

export interface CompleteOnboardingInput {
  walletName: string;
  walletType: 'cash' | 'bank' | 'ewallet';
  openingBalance: Money;
}

/**
 * Onboarding step 1 (the only mandatory step — see
 * tasks/04-authentication/spec.md and todo.md "Onboarding"). The starter
 * "Tunai" wallet already exists (seeded atomically at signup — see
 * `seedNewUserAccount` above); this step lets the new user turn it into
 * their real first wallet (rename it, pick its actual type, and record its
 * real starting balance) rather than making them create a second one from
 * scratch. A nonzero opening balance writes an `opening_balance` ledger
 * entry — docs/03-domain-model.md §6.3: "saldo = jumlah entry" has no
 * exceptions.
 */
export async function completeOnboarding(
  userId: string,
  input: CompleteOnboardingInput,
): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.defaultWalletId) {
      throw new NotFoundError('Dompet awal tidak ditemukan');
    }

    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(and(eq(wallets.id, user.defaultWalletId), eq(wallets.userId, userId)))
      .limit(1);
    if (!wallet) {
      throw new NotFoundError('Dompet awal tidak ditemukan');
    }

    await tx
      .update(wallets)
      .set({ name: input.walletName, type: input.walletType, updatedAt: new Date() })
      .where(eq(wallets.id, wallet.id));

    if (input.openingBalance !== 0n) {
      await postEntries(tx, [
        {
          userId,
          walletId: wallet.id,
          amount: input.openingBalance,
          source: 'opening_balance',
          entryDate: new Date(),
        },
      ]);
    }

    await tx.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, userId));
  });
}
