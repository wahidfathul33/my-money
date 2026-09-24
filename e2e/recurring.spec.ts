import { and, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '../src/lib/db/write';
import { wallets } from '../src/lib/db/schema/wallets';
import { categories } from '../src/lib/db/schema/categories';
import { savingsGoals } from '../src/lib/db/schema/savings';
import { recurringSavingsContributions, recurringTransactions } from '../src/lib/db/schema/recurring';
import { toLocalDate } from '../src/lib/date/timezone';
import { expect, test } from './fixtures/authenticated';

/**
 * tasks/24-recurring-transactions/spec.md verification — the three e2e
 * scenarios its own "Verifikasi" section names: a recurring transaction
 * posting via a simulated cron call, an auto-contribution doing the same
 * (and staying net-worth-neutral), and pausing preventing materialization.
 *
 * "Simulated cron" = a real HTTP call to `/api/cron/recurring` with the
 * real `Bearer $CRON_SECRET` header (`process.env.CRON_SECRET`, loaded via
 * `dotenv/config` in playwright.config.ts, same as every other env var this
 * suite's DB-touching specs already rely on — e.g. e2e/auth.spec.ts) — the
 * exact route Vercel Cron itself would hit, not a direct service-function
 * call. `page.request` shares nothing with the browser session and needs
 * none here; this is a machine-to-machine call, same as production.
 *
 * Scenario A picks "Kemarin" (yesterday) as the transaction's date before
 * enabling "Ulangi transaksi ini" — this is what keeps the CREATE action's
 * own synchronous first-occurrence materialization (spec.md: only fires
 * when `start_date` is TODAY) from firing, so the simulated cron call is
 * genuinely what posts the first occurrence, not a redundant no-op after
 * the fact.
 *
 * Scenario B seeds its `recurring_savings_contributions` row directly via
 * `dbWrite` rather than through the goal detail page's toggle — that
 * toggle's own creation form has no date field at all (spec.md's field
 * list for it is wallet/amount/frequency/end-date only, no start date), so
 * every rule created through it starts today and is ALSO synchronously
 * materialized on creation by design — already covered by
 * src/lib/services/__tests__/recurring-savings.integration.test.ts's own
 * "materializes the first contribution synchronously" test. Seeding
 * directly here isolates the CRON path specifically, the same "write
 * directly, exercise the real route" shape e2e/auth.spec.ts already uses
 * for its own setup.
 */
const DB_TIMEOUT = { timeout: 20_000 };

async function callRecurringCron(page: import('@playwright/test').Page): Promise<void> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) throw new Error('CRON_SECRET is not set — check .env');
  const response = await page.request.get('/api/cron/recurring', {
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  expect(response.status()).toBe(200);
}

test.describe('Transaksi rutin & kontribusi otomatis', () => {
  test.describe.configure({ retries: 2 });
  test.use({ viewport: { width: 390, height: 844 } }); // FAB, same rationale as e2e/transactions.spec.ts

  test('buat transaksi rutin (tanggal kemarin) -> tidak langsung terpost -> cron simulasi -> muncul di riwayat, saldo dompet berubah', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto('/wallets');
    const tunaiCard = page.getByRole('link', { name: /Tunai/ });
    await expect(tunaiCard).toBeVisible(DB_TIMEOUT);
    await expect(tunaiCard).toContainText('Rp0');

    await page.getByRole('button', { name: 'Tambah transaksi' }).click();
    const sheet = page.getByRole('dialog', { name: 'Tambah transaksi' });
    await expect(sheet).toBeVisible();

    // Pemasukan — an income from a zero balance keeps the resulting wallet
    // figure unambiguous (no sign-of-overdraft nuance to reason about).
    await sheet.getByRole('tab', { name: 'Pemasukan' }).click();
    for (const digit of ['5', '0', '0', '0', '0']) {
      await sheet.getByRole('button', { name: digit, exact: true }).click();
    }
    await sheet.getByRole('button', { name: 'Gaji' }).click();

    // Date = "Kemarin" — see this file's header for why.
    await sheet.getByRole('button', { name: 'Hari ini' }).click();
    const dateSheet = page.getByRole('dialog', { name: 'Pilih tanggal' });
    await expect(dateSheet).toBeVisible();
    await dateSheet.getByRole('button', { name: 'Kemarin' }).click();
    await expect(dateSheet).not.toBeVisible();

    await sheet.getByRole('switch', { name: 'Ulangi transaksi ini' }).click();
    await expect(sheet.getByRole('tab', { name: 'Bulanan' })).toBeVisible();

    await sheet.getByRole('button', { name: 'Simpan' }).click();
    await expect(sheet).not.toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Transaksi rutin tersimpan', { exact: true })).toBeVisible(DB_TIMEOUT);

    // Not yet materialized — the rule was only just stored.
    await page.goto('/wallets');
    await expect(page.getByRole('link', { name: /Tunai/ })).toContainText('Rp0', DB_TIMEOUT);

    await callRecurringCron(page);

    // Now materialized: wallet balance moved, and it shows up in history.
    await page.goto('/wallets');
    await expect(page.getByRole('link', { name: /Tunai/ })).toContainText('Rp50.000', DB_TIMEOUT);

    await page.goto('/transactions');
    await expect(page.getByText('Gaji').first()).toBeVisible(DB_TIMEOUT);
  });

  test('kontribusi otomatis (baris disiapkan langsung, jatuh tempo kemarin) -> cron simulasi -> saldo target naik, kekayaan bersih tidak berubah', async ({
    page,
    authedUserId,
  }) => {
    test.setTimeout(120_000);

    // A funded wallet to contribute FROM.
    await page.goto('/wallets');
    await page.getByRole('button', { name: 'Tambah dompet' }).click();
    const walletSheet = page.getByRole('dialog', { name: 'Tambah dompet' });
    await walletSheet.getByLabel('Nama dompet').fill('BCA');
    await walletSheet.getByLabel('Saldo awal (Rp)').fill('5000000');
    await walletSheet.getByRole('button', { name: 'Tambah dompet' }).click();
    await expect(walletSheet).not.toBeVisible(DB_TIMEOUT);
    await expect(page.getByRole('link', { name: /BCA/ })).toContainText('Rp5.000.000', DB_TIMEOUT);

    await page.goto('/wealth/savings');
    await page.getByRole('button', { name: 'Buat target' }).click();
    const createSheet = page.getByRole('dialog', { name: 'Target tabungan baru' });
    await expect(createSheet).toBeVisible();
    await createSheet.getByLabel('Nama target').fill('Dana Darurat Rutin');
    await createSheet.getByLabel('Target (Rp)').fill('10000000');
    await createSheet.getByRole('button', { name: 'Buat target' }).click();
    await expect(createSheet).not.toBeVisible(DB_TIMEOUT);

    const goalLink = page.getByRole('link', { name: /Dana Darurat Rutin/ });
    await expect(goalLink).toBeVisible(DB_TIMEOUT);
    await goalLink.click();
    await expect(page).toHaveURL(/\/wealth\/savings\/[^/]+$/, DB_TIMEOUT);
    const goalId = page.url().split('/').pop()!;

    // Seed the recurring rule directly, due YESTERDAY — see this file's
    // header for why the UI toggle's own form can't express this.
    const [wallet] = await dbWrite
      .select({ id: wallets.id })
      .from(wallets)
      .where(and(eq(wallets.userId, authedUserId), eq(wallets.name, 'BCA')));
    const [goal] = await dbWrite.select({ id: savingsGoals.id }).from(savingsGoals).where(eq(savingsGoals.id, goalId));
    expect(wallet).toBeDefined();
    expect(goal).toBeDefined();

    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return toLocalDate(d);
    })();

    await dbWrite.insert(recurringSavingsContributions).values({
      id: uuidv7(),
      userId: authedUserId,
      goalId: goal!.id,
      walletId: wallet!.id,
      amount: 350_000_00n,
      frequency: 'monthly',
      startDate: yesterday,
      nextRunDate: yesterday,
      status: 'active',
    });

    // Not yet materialized — wallet balance untouched.
    await page.goto('/wallets');
    await expect(page.getByRole('link', { name: /BCA/ })).toContainText('Rp5.000.000', DB_TIMEOUT);

    await callRecurringCron(page);

    // Net-worth-neutral: wallet down, goal up, by the exact same amount.
    await page.goto('/wallets');
    await expect(page.getByRole('link', { name: /BCA/ })).toContainText('Rp4.650.000', DB_TIMEOUT);

    await page.goto(`/wealth/savings/${goalId}`);
    await expect(page.getByText('Rp350.000').first()).toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('dari Rp10.000.000')).toBeVisible();

    // The toggle itself reflects the now-active rule.
    await expect(page.getByRole('switch', { name: 'Kontribusi otomatis' })).toBeChecked(DB_TIMEOUT);

    // A second cron call is a no-op (idempotent) — no further change.
    await callRecurringCron(page);
    await page.goto('/wallets');
    await expect(page.getByRole('link', { name: /BCA/ })).toContainText('Rp4.650.000', DB_TIMEOUT);
  });

  test('jeda transaksi rutin -> cron simulasi -> tidak ada transaksi baru', async ({ page, authedUserId }) => {
    test.setTimeout(120_000);

    const [wallet] = await dbWrite
      .select({ id: wallets.id })
      .from(wallets)
      .where(eq(wallets.userId, authedUserId))
      .limit(1);
    expect(wallet).toBeDefined();

    // Seed a rule directly (avoids the UI toggle-time synchronous
    // materialization entirely — this test only cares about the PAUSED
    // path, not the create flow, already covered by the first scenario).
    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return toLocalDate(d);
    })();
    const [category] = await dbWrite
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.userId, authedUserId), eq(categories.type, 'expense')))
      .limit(1);
    expect(category).toBeDefined();

    const ruleId = uuidv7();
    await dbWrite.insert(recurringTransactions).values({
      id: ruleId,
      userId: authedUserId,
      type: 'expense',
      amount: 20_000_00n,
      categoryId: category!.id,
      walletId: wallet!.id,
      frequency: 'daily',
      startDate: yesterday,
      nextRunDate: yesterday,
      status: 'active',
    });

    await page.goto('/settings/recurring');
    await expect(page.getByText('Aktif').first()).toBeVisible(DB_TIMEOUT);

    await page.getByRole('button', { name: 'Jeda' }).click();
    await expect(page.getByText('Dijeda').first()).toBeVisible(DB_TIMEOUT);

    await callRecurringCron(page);

    // Wallet untouched, row still shows next_run_date unchanged and paused.
    await page.reload();
    await expect(page.getByText('Dijeda').first()).toBeVisible(DB_TIMEOUT);

    const [rule] = await dbWrite.select().from(recurringTransactions).where(eq(recurringTransactions.id, ruleId));
    expect(rule!.status).toBe('paused');
    expect(rule!.nextRunDate).toBe(yesterday);
  });
});
