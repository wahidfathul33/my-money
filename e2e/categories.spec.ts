import { and, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '../src/lib/db/write';
import { categories } from '../src/lib/db/schema/categories';
import { transactions } from '../src/lib/db/schema/transactions';
import { auditRouteA11y } from './helpers/a11y-check';
import { expect, test } from './fixtures/authenticated';

/**
 * e2e/categories.spec.ts — tasks/06-categories/spec.md, todo.md "E2E":
 *   "buat → pakai di transaksi → hapus ditolak → arsipkan"
 *   "ganti nama kategori bawaan → tetap muncul, kunci tidak berubah"
 *
 * `authedUserId` (e2e/fixtures/authenticated.ts) already ran seedNewUser,
 * so the 16 canonical categories (docs/03 §7.1) exist before either test
 * starts — no seeding needed here beyond what each test itself is about.
 *
 * "Used by a transaction" is simulated with a direct `dbWrite` insert
 * rather than through a record-transaction UI, since that UI belongs to
 * task 07 and doesn't exist yet — the transactions TABLE (docs/04 §7) has
 * existed since task 03, which is all `deleteCategory`'s usage check reads.
 */

async function findCategoryByName(userId: string, name: string) {
  const [row] = await dbWrite
    .select()
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.name, name)));
  return row;
}

// Every mutation here is a real Server Action + `router.refresh()` round
// trip against the real Neon database (no mocking, per this repo's e2e
// philosophy) — observed this session to occasionally take 10-20s under
// heavy concurrent load (several DB-touching Vitest/Playwright runs at
// once; see vitest.config.ts's comment on the same underlying latency).
// A single slow round trip can eat most of the 30s assertion default, so
// post-mutation assertions get a longer explicit timeout, and both tests
// get a longer overall budget — same reasoning as e2e/auth.spec.ts's
// `test.setTimeout(60_000)` calls.
const AFTER_MUTATION = { timeout: 30_000 };

test.describe('categories settings', () => {
  // The same real-DB contention documented above can make even the FIRST
  // navigation's session lookup (src/lib/auth/require-user.ts, via
  // Auth.js's own DB session strategy) slow enough to miss the default 5s
  // assertion timeout — not this spec's logic, but still worth absorbing
  // the same way e2e/auth.spec.ts already does for its own DB-heavy tests.
  test.describe.configure({ retries: 2 });

  test('create → used by a transaction → delete is rejected, offering archive → archive succeeds', async ({
    page,
    authedUserId,
  }) => {
    test.setTimeout(120_000);

    await page.goto('/settings/categories');
    await expect(page.getByRole('heading', { name: 'Kategori' })).toBeVisible(AFTER_MUTATION);

    // Create a custom expense category.
    await page.getByRole('button', { name: 'Kategori Baru' }).click();
    await page.getByLabel('Nama kategori').fill('Kopi Spesialti');
    await page.getByRole('button', { name: 'Buat Kategori' }).click();

    await expect(page.getByText('Kopi Spesialti')).toBeVisible(AFTER_MUTATION);

    const created = await findCategoryByName(authedUserId, 'Kopi Spesialti');
    expect(created).toBeDefined();
    expect(created!.systemKey).toBeNull();

    const transactionId = uuidv7();
    await dbWrite.insert(transactions).values({
      id: transactionId,
      userId: authedUserId,
      type: 'expense',
      categoryId: created!.id,
      amount: 4500000n,
      transactionDate: new Date(),
      createdBy: authedUserId,
    });

    try {
      // Fresh navigation — the transaction above was inserted directly via
      // dbWrite, bypassing revalidatePath, so the server-rendered list needs
      // a real reload to reflect it.
      await page.reload();

      await page.getByRole('button', { name: 'Hapus Kopi Spesialti' }).click();
      await expect(page.getByRole('heading', { name: 'Hapus "Kopi Spesialti"?' })).toBeVisible();
      // Usage count is its own fetch (getCategoryUsageCountAction) — same
      // real-DB round trip, same generous timeout.
      await expect(page.getByText(/dipakai\s*1\s*transaksi/)).toBeVisible(AFTER_MUTATION);

      // Delete is refused — no "Hapus Kategori" button, only the archive fallback.
      await expect(page.getByRole('button', { name: 'Hapus Kategori' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Arsipkan sebagai gantinya' }).click();

      await expect(page.getByRole('heading', { name: 'Hapus "Kopi Spesialti"?' })).not.toBeVisible(
        AFTER_MUTATION,
      );
      await expect(
        page.getByText('Kopi Spesialti').locator('..').getByText('Diarsipkan'),
      ).toBeVisible(AFTER_MUTATION);

      const afterArchive = await findCategoryByName(authedUserId, 'Kopi Spesialti');
      expect(afterArchive?.isArchived).toBe(true);
      expect(afterArchive?.id).toBe(created!.id); // not deleted, same row
    } finally {
      // transactions.category_id is ON DELETE RESTRICT — clean this up
      // before the fixture's teardown deletes the user (which cascades to
      // categories), or that cascade would hit the same RESTRICT.
      await dbWrite.delete(transactions).where(eq(transactions.id, transactionId));
    }
  });

  test('renaming a built-in category keeps it visible with its system_key unchanged', async ({
    page,
    authedUserId,
  }) => {
    test.setTimeout(90_000);

    await page.goto('/settings/categories');

    await page.getByRole('button', { name: 'Edit Tagihan' }).click();
    await expect(page.getByRole('heading', { name: 'Edit Kategori' })).toBeVisible();
    await expect(page.getByText('Kategori bawaan')).toBeVisible();

    const nameInput = page.getByLabel('Nama kategori');
    await nameInput.fill('Tagihan Bulanan');
    await page.getByRole('button', { name: 'Simpan' }).click();

    await expect(page.getByRole('heading', { name: 'Edit Kategori' })).not.toBeVisible(
      AFTER_MUTATION,
    );
    await expect(page.getByText('Tagihan Bulanan')).toBeVisible(AFTER_MUTATION);

    const renamed = await findCategoryByName(authedUserId, 'Tagihan Bulanan');
    expect(renamed).toBeDefined();
    expect(renamed!.systemKey).toBe('bills');
  });

  // /settings/categories has neither an overflow nor an axe check anywhere
  // else (tasks/23-hardening-and-launch's route audit) — the 16 canonical
  // categories from seedNewUser are already enough content to audit, no
  // extra seeding needed.
  test('/settings/categories — tanpa horizontal overflow, axe nol pelanggaran', async ({ page }) => {
    test.setTimeout(60_000);
    await auditRouteA11y(page, '/settings/categories');
  });
});
