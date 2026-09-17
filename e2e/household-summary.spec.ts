import { uuidv7 } from 'uuidv7';
import { dbWrite } from '../src/lib/db/write';
import { householdMembers } from '../src/lib/db/schema';
import { createTestUser, deleteTestHousehold, deleteTestUser } from '../src/lib/db/__tests__/test-helpers';
import { expect, test } from './fixtures/authenticated';

/**
 * tasks/20-dashboard: "household baru → daftar langkah → selesaikan →
 * daftar hilang" (todo.md), and the real summary sections replacing that
 * list once done. The second member's ACTIVE membership is seeded directly
 * (`household_members` insert) rather than through the real invite/accept
 * UI — that flow is already covered end to end by e2e/household-membership.spec.ts;
 * re-driving it here would only add time without adding confidence in
 * anything this task owns (same reasoning e2e/sharing.spec.ts's own file
 * header gives for the identical shortcut).
 */
const DB_TIMEOUT = { timeout: 20_000 };

test.describe('Household summary — setup steps selesai -> ringkasan asli', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('selesaikan ketiga langkah -> daftar langkah hilang, Anggota menampilkan 2 orang', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/household/new');
    await page.getByLabel('Nama keluarga').fill('Keluarga Lengkap');
    await page.getByRole('button', { name: 'Buat Keluarga' }).click();
    await expect(page).toHaveURL(/\/household\/(?!new$)[^/]+$/, DB_TIMEOUT);
    const householdId = page.url().split('/household/')[1]!.split(/[/?]/)[0]!;

    await expect(page.getByText('Keluarga Lengkap siap digunakan')).toBeVisible(DB_TIMEOUT);

    // Step 1 — "Undang anggota": seed a second ACTIVE member directly.
    const secondMemberId = await createTestUser({ name: 'Istri' });
    try {
      await dbWrite.insert(householdMembers).values({
        id: uuidv7(),
        householdId,
        userId: secondMemberId,
        role: 'member',
        status: 'active',
        joinedAt: new Date(),
      });

      // Step 2 — "Tandai pengeluaran keluarga": record an expense tagged 🏠.
      await page.getByRole('button', { name: 'Tambah transaksi' }).click();
      const addSheet = page.getByRole('dialog', { name: 'Tambah transaksi' });
      await expect(addSheet).toBeVisible();
      for (const digit of ['2', '0', '0', '0', '0']) {
        await addSheet.getByRole('button', { name: digit, exact: true }).click();
      }
      await addSheet.getByRole('button', { name: 'Makan & Minum' }).click();
      await addSheet.getByRole('button', { name: 'Tandai ke keluarga' }).click();
      await expect(addSheet.getByRole('button', { name: /^Ditandai ke/ })).toBeVisible();
      await addSheet.getByRole('button', { name: 'Simpan' }).click();
      await expect(addSheet).not.toBeVisible(DB_TIMEOUT);

      // Step 3 — "Bagikan yang ingin dihitung": flip the share-wealth switch.
      await page.goto('/settings/sharing');
      const shareSwitch = page.getByRole('switch', { name: 'Bagikan kekayaan ke Keluarga Lengkap' });
      await shareSwitch.click();
      const confirmDialog = page.getByRole('dialog', { name: /Bagikan kekayaan/ });
      await expect(confirmDialog).toBeVisible(DB_TIMEOUT);
      await confirmDialog.getByRole('button', { name: 'Bagikan' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0, DB_TIMEOUT);
      // `aria-checked` flips optimistically the instant "Bagikan" is
      // clicked (src/features/sharing/components/share-wealth-toggle.tsx's
      // `confirmShare`) — NOT proof the server mutation has landed yet.
      // Waiting for the switch to become enabled again (it's `disabled`
      // only while its `useTransition` is pending) is what actually proves
      // `setShareWealthAction` has resolved.
      await expect(shareSwitch).toBeEnabled(DB_TIMEOUT);
      await expect(shareSwitch).toHaveAttribute('aria-checked', 'true');

      // All three steps done -> the setup-steps card disappears entirely,
      // replaced by the real summary (spec.md: "hilang setelah ketiganya tuntas").
      await page.goto(`/household/${householdId}`);
      await expect(page.getByRole('heading', { name: 'Keluarga Lengkap' })).toBeVisible(DB_TIMEOUT);
      await expect(page.getByText('Keluarga Lengkap siap digunakan')).toHaveCount(0);

      await expect(page.getByRole('heading', { name: 'Anggota (2)' })).toBeVisible();
      await expect(page.getByText('Makan & Minum')).toBeVisible(); // Per Kategori
      await expect(page.getByText('Pengeluaran Keluarga')).toBeVisible();
    } finally {
      await deleteTestHousehold(householdId);
      await deleteTestUser(secondMemberId);
    }
  });
});
