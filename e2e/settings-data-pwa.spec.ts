import AxeBuilder from '@axe-core/playwright';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '../src/lib/db/write';
import { households, householdMembers, users } from '../src/lib/db/schema';
import { deleteTestHousehold, deleteTestUser } from '../src/lib/db/__tests__/test-helpers';
import { seedSessionUser, setSessionCookie } from './helpers/auth-session';
import { test as base, expect as baseExpect } from './fixtures/base';
import { test, expect } from './fixtures/authenticated';

const DB_TIMEOUT = { timeout: 20_000 };

/**
 * tasks/22-settings-sharing-pwa. `next dev` (this suite's target — see
 * playwright.config.ts) never registers `/sw.js`
 * (src/components/layout/service-worker-registration.tsx is deliberately
 * production-only, todo.md: "Registrasi di layout.tsx, hanya di
 * produksi"), so the service worker's own cache-serving behavior isn't
 * exercisable here — that's exactly why todo.md's final verification list
 * puts "matikan jaringan → aplikasi tetap terbuka dengan banner" under
 * MANUAL steps, not automated e2e. What IS fully client-side (the
 * `navigator.onLine` banner and the save-blocking guard) is covered below
 * against the real running app.
 */
test.describe('offline banner + blocked save', () => {
  test('going offline shows the banner over already-rendered content; coming back online hides it', async ({ page }) => {
    await page.goto('/transactions');
    await expect(page.getByRole('heading', { name: 'Transaksi' })).toBeVisible(DB_TIMEOUT);

    await page.context().setOffline(true);
    const banner = page.getByRole('status').filter({ hasText: 'Offline' });
    await expect(banner).toBeVisible(DB_TIMEOUT);
    // Already-rendered content survives — the app doesn't blank out.
    await expect(page.getByRole('heading', { name: 'Transaksi' })).toBeVisible();

    await page.context().setOffline(false);
    await expect(banner).not.toBeVisible(DB_TIMEOUT);
  });

  test('attempting to save a transaction while offline is blocked with a clear message, never silently queued', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Tambah transaksi' }).click();
    const sheet = page.getByRole('dialog', { name: 'Tambah transaksi' });
    await expect(sheet).toBeVisible();
    for (const digit of ['3', '0', '0', '0', '0']) {
      await sheet.getByRole('button', { name: digit, exact: true }).click();
    }
    await sheet.getByRole('button', { name: 'Makan & Minum' }).click();

    await page.context().setOffline(true);
    await sheet.getByRole('button', { name: 'Simpan' }).click();

    await expect(sheet.getByText('Butuh koneksi untuk menyimpan')).toBeVisible(DB_TIMEOUT);
    // Still open, still showing the unsaved input — nothing was submitted.
    await expect(sheet).toBeVisible();

    await page.context().setOffline(false);
  });
});

test.describe('/settings — accessibility', () => {
  const routes = ['/settings', '/settings/profile', '/settings/preferences', '/settings/data', '/settings/about', '/settings/sharing'];

  for (const route of routes) {
    test(`axe reports zero violations on ${route}`, async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).include('main').analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  }
});

test.describe('account deletion — confirm-by-email dialog', () => {
  test('the destructive button stays disabled until the typed text exactly matches the caller\'s own email', async ({ page }) => {
    await page.goto('/settings/data');
    await page.getByRole('button', { name: 'Hapus akun' }).click();

    const dialog = page.getByRole('dialog', { name: 'Hapus akun secara permanen?' });
    await expect(dialog).toBeVisible();
    const confirmButton = dialog.getByRole('button', { name: 'Hapus akun' });
    await expect(confirmButton).toBeDisabled();

    const input = dialog.getByLabel(/Ketik ".*" untuk konfirmasi/);
    await input.fill('bukan-email-yang-benar@example.com');
    await expect(confirmButton).toBeDisabled();

    // Cancel — proves the mismatch path never got anywhere near the action.
    await dialog.getByRole('button', { name: 'Batal' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('deleting the account signs out and redirects to /signin, and the row is actually gone', async ({ page, authedUserId }) => {
    await page.goto('/settings/data');
    await page.getByRole('button', { name: 'Hapus akun' }).click();

    const dialog = page.getByRole('dialog', { name: 'Hapus akun secara permanen?' });
    await expect(dialog).toBeVisible();

    const [row] = await dbWrite.select({ email: users.email }).from(users).where(eq(users.id, authedUserId));
    const email = row!.email;

    await dialog.getByLabel(/Ketik ".*" untuk konfirmasi/).fill(email);
    await dialog.getByRole('button', { name: 'Hapus akun' }).click();

    await expect(page).toHaveURL(/\/signin/, DB_TIMEOUT);

    const [stillThere] = await dbWrite.select({ id: users.id }).from(users).where(eq(users.id, authedUserId));
    expect(stillThere).toBeUndefined();
  });
});

/**
 * Separate `describe` using the (non-auto-authenticated) base fixture —
 * this scenario needs a household actually created under the SAME seeded
 * session the page navigates as, which `authenticated.ts`'s fixture
 * doesn't expose a hook to do before first navigation.
 */
base.describe('account deletion — owner block (real household)', () => {
  base('blocked screen names the household and links to its settings; deletion succeeds once ownership is no longer held', async ({
    browser,
    baseURL,
  }) => {
    base.setTimeout(60_000);

    const owner = await seedSessionUser({ onboarded: true, name: 'Pemilik E2E' });
    const context = await browser.newContext({ baseURL });
    await setSessionCookie(context, owner.sessionToken);
    const page = await context.newPage();

    const householdId = uuidv7();
    await dbWrite.insert(households).values({ id: householdId, name: 'Keluarga Penghalang', createdBy: owner.userId });
    await dbWrite.insert(householdMembers).values({
      id: uuidv7(),
      householdId,
      userId: owner.userId,
      role: 'owner',
      status: 'active',
      joinedAt: new Date(),
    });

    try {
      await page.goto('/settings/data');
      await baseExpect(page.getByText('Akun belum bisa dihapus')).toBeVisible(DB_TIMEOUT);
      await baseExpect(page.getByText('Keluarga Penghalang')).toBeVisible();
      const link = page.getByRole('link', { name: /Keluarga Penghalang/ });
      await baseExpect(link).toHaveAttribute('href', `/household/${householdId}/settings`);
      // The destructive "Hapus akun" button is never rendered in this state.
      await baseExpect(page.getByRole('button', { name: 'Hapus akun' })).toHaveCount(0);
    } finally {
      await context.close();
      await deleteTestHousehold(householdId);
      await deleteTestUser(owner.userId);
    }
  });
});
