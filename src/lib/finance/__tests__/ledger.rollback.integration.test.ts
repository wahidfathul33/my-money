// @vitest-environment node
/**
 * Atomicity proof — against the real Neon database (.env, loaded via
 * vitest.config.ts). This is the test the acceptance criteria in
 * tasks/03-database-foundation/spec.md call out by name: a failure partway
 * through a `dbWrite.transaction()` must leave zero partial changes.
 *
 * The second `describe` block proves the flip side documented in
 * docs/05-financial-integrity.md §1: `neon-http` has no atomicity at all
 * across multiple statements, and it fails SILENTLY (no thrown error) — the
 * entire reason `dbRead`/`dbWrite` are split, and enforced separately, in the
 * first place.
 */
import { describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { users } from '@/lib/db/schema/users';
import { wallets } from '@/lib/db/schema/wallets';
import { ledgerEntries } from '@/lib/db/schema/transactions';
import { postEntries } from '../ledger';
import { createTestUser, createTestWallet, deleteTestUser } from '@/lib/db/__tests__/test-helpers';

describe('dbWrite.transaction rollback (neon-serverless)', () => {
  it('leaves zero partial changes when a step after postEntries throws', async () => {
    const userId = await createTestUser();
    const walletId = await createTestWallet(userId, { balance: 777_00n });

    await expect(
      dbWrite.transaction(async (tx) => {
        // A real multi-table write, same shape as recording a transaction:
        // ledger entry + balance update succeed first...
        await postEntries(tx, [
          { userId, walletId, amount: 100000n, source: 'adjustment', entryDate: new Date() },
        ]);
        // ...then something later in the SAME operation fails. Nothing above
        // this line should survive once the transaction rejects.
        throw new Error('simulated failure after postEntries succeeded');
      }),
    ).rejects.toThrow('simulated failure after postEntries succeeded');

    const [wallet] = await dbWrite.select().from(wallets).where(eq(wallets.id, walletId));
    expect(wallet?.balance).toBe(777_00n); // unchanged from before the transaction

    const entries = await dbWrite
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.walletId, walletId));
    expect(entries).toHaveLength(0); // the insert inside postEntries did not survive

    await deleteTestUser(userId);
  });

  it('rolls back a plain multi-row insert when a later statement in the same transaction fails', async () => {
    // Driver-level proof, independent of postEntries: dbWrite really is
    // transactional. Insert two users, then force a failure (duplicate
    // primary key) on a third statement in the same transaction.
    const id1 = uuidv7();
    const id2 = uuidv7();

    await expect(
      dbWrite.transaction(async (tx) => {
        await tx.insert(users).values({ id: id1, email: `${id1}@example.invalid` });
        await tx.insert(users).values({ id: id2, email: `${id2}@example.invalid` });
        // Duplicate primary key -> constraint violation -> transaction fails.
        await tx.insert(users).values({ id: id1, email: `${id1}@example.invalid` });
      }),
    ).rejects.toThrow();

    const rows = await dbWrite.select().from(users).where(inArray(users.id, [id1, id2]));
    expect(rows).toHaveLength(0); // neither of the first two inserts survived
  });
});

describe('neon-http has no multi-statement atomicity (why the driver split exists)', () => {
  it('rejects .transaction() outright rather than pretending to support it', async () => {
    const sqlClient = neon(process.env.DATABASE_URL!);
    const httpDb = drizzleHttp({ client: sqlClient });
    const id = uuidv7();

    await expect(
      httpDb.transaction(async (tx) => {
        await tx.insert(users).values({ id, email: `${id}@example.invalid` });
        throw new Error('should never get here');
      }),
    ).rejects.toThrow(/transaction/i);

    // Belt and braces: confirm nothing leaked through even though it threw
    // before running anything.
    const rows = await httpDb.select().from(users).where(eq(users.id, id));
    expect(rows).toHaveLength(0);
  });

  it('SILENTLY leaves a partial write behind when steps run as separate statements (no .transaction())', async () => {
    // This is the actual danger docs/05-financial-integrity.md §1 warns
    // about: neon-http sends every statement as its own HTTP request. There
    // is no wrapper to even attempt here — each call below just IS its own
    // request, uncoordinated with the others. If a real service were built
    // on dbRead this way, the first write would commit permanently and
    // nothing would ever report that the overall operation failed.
    const sqlClient = neon(process.env.DATABASE_URL!);
    const httpDb = drizzleHttp({ client: sqlClient });
    const id = uuidv7();

    await httpDb.insert(users).values({ id, email: `${id}@example.invalid` });

    await expect(
      httpDb.insert(users).values({ id, email: `${id}@example.invalid` }), // duplicate PK
    ).rejects.toThrow();

    // The first insert is still there — nothing rolled it back, and nothing
    // about the failed second call raised any alarm about the first one.
    const rows = await httpDb.select().from(users).where(eq(users.id, id));
    expect(rows).toHaveLength(1);

    await httpDb.delete(users).where(eq(users.id, id));
  });
});
