import AxeBuilder from '@axe-core/playwright';
import { and, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '../src/lib/db/write';
import { categories, households, householdMembers, wallets } from '../src/lib/db/schema';
import { deleteTestHousehold, deleteTestUser } from '../src/lib/db/__tests__/test-helpers';
import { createTransaction } from '../src/lib/services/transactions';
import { seedSessionUser, setSessionCookie } from './helpers/auth-session';
import { test, expect } from './fixtures/authenticated';

/**
 * tasks/21-reports — the two things this task's own AGENTS briefing calls
 * out as easiest to get wrong: NO horizontal scroll at 360px on any chart
 * (AGENTS.md: "This needs an actual e2e check that measures for horizontal
 * overflow, not just a visual judgment call"), and Recharts loading ONLY on
 * report routes (spec.md's Performa section). Aggregation correctness
 * itself is covered by src/features/reports/__tests__/*.integration.test.ts
 * — this suite is about the RENDERED page.
 */
const WIDTHS = [360, 375];
const HEIGHT = 844;
const DB_TIMEOUT = { timeout: 20_000 };

async function getExpenseCategoryIds(userId: string, limit: number): Promise<string[]> {
  const rows = await dbWrite
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.type, 'expense')))
    .orderBy(categories.sortOrder)
    .limit(limit);
  return rows.map((r) => r.id);
}

async function getIncomeCategoryId(userId: string): Promise<string> {
  const [row] = await dbWrite
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.type, 'income')))
    .limit(1);
  return row!.id;
}

async function getStarterWalletId(userId: string): Promise<string> {
  const [row] = await dbWrite.select({ id: wallets.id }).from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return row!.id;
}

/** Seeds one dominant expense (> 80% of the period's total), 7 small
 * expenses across other categories (enough to force the horizontal bar
 * chart's `mergeTailIntoOther` into an actual "Lainnya" bucket, per
 * src/lib/finance/report-aggregation.ts's `MAX_CHART_SERIES = 6`), one
 * income transaction, and an older transaction (> 7 days back) so the
 * page's `hasEnoughHistory` empty-state gate passes. */
async function seedReportData(userId: string): Promise<void> {
  const walletId = await getStarterWalletId(userId);
  const expenseCategoryIds = await getExpenseCategoryIds(userId, 8);
  const incomeCategoryId = await getIncomeCategoryId(userId);

  const now = new Date();
  const eightDaysAgo = new Date(now.getTime() - 8 * 86_400_000);

  await createTransaction(userId, {
    type: 'expense',
    amount: 900_000_00n,
    categoryId: expenseCategoryIds[0]!,
    walletId,
    transactionDate: eightDaysAgo,
    note: 'Dominan',
    idempotencyKey: uuidv7(),
  });

  for (let i = 1; i < expenseCategoryIds.length; i++) {
    await createTransaction(userId, {
      type: 'expense',
      amount: 10_000_00n,
      categoryId: expenseCategoryIds[i]!,
      walletId,
      transactionDate: now,
      note: `Kecil ${i}`,
      idempotencyKey: uuidv7(),
    });
  }

  await createTransaction(userId, {
    type: 'income',
    amount: 3_000_000_00n,
    categoryId: incomeCategoryId,
    walletId,
    transactionDate: now,
    note: 'Gaji',
    idempotencyKey: uuidv7(),
  });
}

test.describe('Reports — personal', () => {
  test('renders all 5 sections, a data table under every chart, a dominant-category note, and a merged Lainnya bucket', async ({
    page,
    authedUserId,
  }) => {
    test.setTimeout(60_000);
    await seedReportData(authedUserId);

    await page.goto('/reports');

    await expect(page.getByRole('heading', { name: 'Pemasukan vs Pengeluaran' })).toBeVisible(DB_TIMEOUT);
    await expect(page.getByRole('heading', { name: 'Pengeluaran per Kategori' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Kategori Terbesar' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Arus Kas' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pertumbuhan Tabungan' })).toBeVisible();

    // todo.md: "Setiap chart disertai <DataTable> di bawahnya" — 4 charted
    // sections (income-vs-expense, expense-by-category, cash flow, savings
    // growth); "Kategori Terbesar" is a ranked list, not a chart, so it has
    // no table of its own by design.
    await expect(page.locator('table')).toHaveCount(4);

    // spec.md: "Satu kategori > 80% → catatan 'Didominasi {kategori}'".
    await expect(page.getByText(/^Didominasi/)).toBeVisible();

    // spec.md: "Maksimal 6 seri; sisanya digabung" — 8 expense categories
    // seeded, so the chart's Y-axis must show a "Lainnya" tick. Scoped to
    // `main` — the bottom nav ALSO has an unrelated "Lainnya" ("More") tab
    // outside the main landmark, which an unscoped text query matches too.
    await expect(page.getByRole('main').getByText('Lainnya')).toBeVisible();
  });

  test('empty state shows "Belum cukup data" for a brand new account', async ({ page }) => {
    // No seeding at all — authedUserId starts with a wallet + categories but
    // zero transactions, same starting point every other spec relies on.
    await page.goto('/reports');
    await expect(page.getByText('Belum cukup data')).toBeVisible(DB_TIMEOUT);
    await expect(page.locator('table')).toHaveCount(0);
  });

  for (const width of WIDTHS) {
    test(`no horizontal overflow at ${width}px`, async ({ page, authedUserId }) => {
      await seedReportData(authedUserId);
      await page.setViewportSize({ width, height: HEIGHT });
      await page.goto('/reports');
      await expect(page.getByRole('heading', { name: 'Pemasukan vs Pengeluaran' })).toBeVisible(DB_TIMEOUT);
      // Let every dynamic()-loaded chart finish mounting before measuring.
      await page.waitForTimeout(500);

      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasOverflow, `/reports @ ${width}px has horizontal overflow`).toBe(false);
    });
  }

  test('axe reports zero violations at 360px, light and dark', async ({ page, authedUserId }) => {
    await seedReportData(authedUserId);
    await page.setViewportSize({ width: 360, height: HEIGHT });
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: 'Pemasukan vs Pengeluaran' })).toBeVisible(DB_TIMEOUT);
    await page.waitForTimeout(500);

    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    }
  });

  test('Recharts JS never loads on a non-report route, but does load on /reports', async ({ page, authedUserId }) => {
    await seedReportData(authedUserId);

    const chunkBodies: string[] = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('/_next/static/') || !url.endsWith('.js')) return;
      try {
        chunkBodies.push(await response.text());
      } catch {
        // Response body may already be gone by the time we read it (e.g.
        // dev-server HMR chunk) — irrelevant to this check either way.
      }
    });

    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');
    await page.goto('/wealth');
    await page.waitForLoadState('networkidle');

    const nonReportHasRecharts = chunkBodies.some((body) => body.includes('recharts'));
    expect(nonReportHasRecharts, 'a non-report route loaded a chunk containing recharts source').toBe(false);

    chunkBodies.length = 0;
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    // Charts are inside a Suspense/dynamic() boundary — give them a moment
    // to actually mount and pull in their chunk.
    await page.waitForTimeout(500);

    const reportHasRecharts = chunkBodies.some((body) => body.includes('recharts'));
    expect(reportHasRecharts, '/reports never loaded a chunk containing recharts source').toBe(true);
  });
});

test.describe('Reports — household', () => {
  test('household report page renders with no horizontal overflow at 360px', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    const owner = await seedSessionUser({ onboarded: true, name: 'Pemilik Laporan E2E' });

    const householdId = uuidv7();
    await dbWrite.insert(households).values({ id: householdId, name: 'Keluarga Laporan E2E', createdBy: owner.userId });
    await dbWrite
      .insert(householdMembers)
      .values({ id: uuidv7(), householdId, userId: owner.userId, role: 'owner', status: 'active', joinedAt: new Date() });

    try {
      const walletId = await getStarterWalletId(owner.userId);
      const expenseCategoryIds = await getExpenseCategoryIds(owner.userId, 3);
      const now = new Date();
      const eightDaysAgo = new Date(now.getTime() - 8 * 86_400_000);

      for (const [index, categoryId] of expenseCategoryIds.entries()) {
        await createTransaction(owner.userId, {
          type: 'expense',
          amount: BigInt(100_000 + index * 50_000) * 100n,
          categoryId,
          walletId,
          transactionDate: index === 0 ? eightDaysAgo : now,
          householdId,
          note: `Belanja keluarga ${index}`,
          idempotencyKey: uuidv7(),
        });
      }

      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await setSessionCookie(context, owner.sessionToken);
      await page.setViewportSize({ width: 360, height: HEIGHT });
      await page.goto(`/household/${householdId}/reports`);
      await expect(page.getByRole('heading', { name: 'Laporan Keluarga' })).toBeVisible(DB_TIMEOUT);
      await page.waitForTimeout(500);

      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasOverflow, '/household/[id]/reports @ 360px has horizontal overflow').toBe(false);

      // At least one table (category breakdown); member breakdown adds a second.
      await expect(page.locator('table').first()).toBeVisible();

      await context.close();
    } finally {
      await deleteTestHousehold(householdId);
      await deleteTestUser(owner.userId);
    }
  });
});
