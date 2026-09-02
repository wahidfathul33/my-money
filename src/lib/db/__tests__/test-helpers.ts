/**
 * Fixtures for integration tests that run against the real Neon database
 * (see `.env` — DATABASE_URL / DATABASE_URL_UNPOOLED, loaded via
 * vitest.config.ts). Every test using these MUST clean up in a `finally`,
 * since src/lib/db/reconcile.ts scans whole tables — leftover rows from a
 * crashed test would either show up as noise in another test's assertions
 * or (if malformed) as a false invariant violation.
 */
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { users } from '@/lib/db/schema/users';
import { wallets } from '@/lib/db/schema/wallets';
import { categories } from '@/lib/db/schema/categories';
import { ledgerEntries } from '@/lib/db/schema/transactions';

export async function createTestUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const id = uuidv7();
  await dbWrite.insert(users).values({
    id,
    email: `test-${id}@example.invalid`,
    ...overrides,
  });
  return id;
}

export async function createTestWallet(
  userId: string,
  overrides: Partial<typeof wallets.$inferInsert> = {},
) {
  const id = uuidv7();
  await dbWrite.insert(wallets).values({
    id,
    userId,
    name: 'Test Wallet',
    type: 'cash',
    ...overrides,
  });
  return id;
}

export async function createTestCategory(
  userId: string,
  overrides: Partial<typeof categories.$inferInsert> = {},
) {
  const id = uuidv7();
  await dbWrite.insert(categories).values({
    id,
    userId,
    name: 'Test Category',
    type: 'expense',
    ...overrides,
  });
  return id;
}

/**
 * Removes a test user and everything that structurally must be cleaned up
 * before it can go (ledger_entries.wallet_id is ON DELETE RESTRICT, so those
 * have to go first; wallets cascade from users but would hit that RESTRICT
 * if left in place).
 */
export async function deleteTestUser(userId: string) {
  await dbWrite.delete(ledgerEntries).where(eq(ledgerEntries.userId, userId));
  await dbWrite.delete(wallets).where(eq(wallets.userId, userId));
  await dbWrite.delete(users).where(eq(users.id, userId));
}
