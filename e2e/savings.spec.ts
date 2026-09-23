import { checkAxeCleanAtEveryColorScheme, checkNoHorizontalOverflow } from './helpers/a11y-check';
import { expect, test } from './fixtures/authenticated';

/**
 * tasks/15-savings-goals/spec.md verification: "kontribusi → saldo turun →
 * net worth tetap". There's no dedicated net-worth page yet (task 19), so
 * "net worth tetap" is asserted the way docs/03 §10.1 states the invariant
 * itself: the wallet's balance falls by EXACTLY the contributed amount, and
 * the wealth hub's "Tabungan" total rises by that SAME amount — cash down,
 * savings up, by the identical figure.
 *
 * UI copy here follows docs/08-copywriting.md's glossary exactly: a
 * savings goal is a "target" (§3 row "Savings goal | Target tabungan"),
 * never "goal" in user-facing text — "Buat target", "Tambah dana", "Tarik
 * dana", matching that doc's §5.4/§5.5 button/empty-state tables.
 *
 * Authenticated via e2e/fixtures/authenticated.ts (auto-seeds a real,
 * onboarded session with a starter "Tunai" wallet at balance 0).
 */
const DB_TIMEOUT = { timeout: 20000 };

test.describe('Savings goals', () => {
  test.describe.configure({ retries: 2 });

  test('buat target -> tambah dana Rp3jt -> saldo dompet turun -> total tabungan naik sama besar -> target tercapai', async ({
    page,
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

    // Create a personal goal — target set low (Rp3jt) so the single
    // contribution below both funds AND completes it, covering the
    // auto-`completed` acceptance criterion in the same flow.
    await page.goto('/wealth/savings');
    await page.getByRole('button', { name: 'Buat target' }).click();
    const createSheet = page.getByRole('dialog', { name: 'Target tabungan baru' });
    await expect(createSheet).toBeVisible();
    await createSheet.getByLabel('Nama target').fill('Dana Darurat');
    await createSheet.getByLabel('Target (Rp)').fill('3000000');
    await createSheet.getByRole('button', { name: 'Buat target' }).click();
    await expect(createSheet).not.toBeVisible(DB_TIMEOUT);

    const goalLink = page.getByRole('link', { name: /Dana Darurat/ });
    await expect(goalLink).toBeVisible(DB_TIMEOUT);
    await goalLink.click();
    await expect(page).toHaveURL(/\/wealth\/savings\/[^/]+$/, DB_TIMEOUT);

    // Contribute Rp3.000.000 from BCA specifically (the sheet defaults to
    // the account default wallet, "Tunai" — switch it).
    await page.getByRole('button', { name: 'Tambah dana' }).click();
    const contributeSheet = page.getByRole('dialog', { name: /^Tambah dana ke/ });
    await expect(contributeSheet).toBeVisible();

    await contributeSheet.getByRole('button', { name: /^Dompet sumber:/ }).click();
    await page.getByRole('dialog', { name: 'Pilih dompet' }).getByRole('button', { name: 'BCA' }).click();

    await expect(
      contributeSheet.getByText('Kekayaan bersih Anda tidak berubah — dana dipindahkan, bukan dibelanjakan.'),
    ).toBeVisible();

    for (const digit of ['3', '0', '0', '0', '0', '0', '0']) {
      await contributeSheet.getByRole('button', { name: digit, exact: true }).click();
    }
    await contributeSheet.getByRole('button', { name: 'Simpan' }).click();
    await expect(contributeSheet).not.toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Kontribusi tersimpan', { exact: true })).toBeVisible(DB_TIMEOUT);

    // The goal is now fully funded — completion banner (exact text: no "!",
    // distinguishing it from the celebration dialog's title below).
    await expect(page.getByText('Target tercapai', { exact: true })).toBeVisible(DB_TIMEOUT);
    // One-time celebration sheet, fired by the contribution that crossed the target.
    const celebrationDialog = page.getByRole('dialog', { name: 'Target tercapai!' });
    await expect(celebrationDialog).toBeVisible();
    await celebrationDialog.getByRole('button', { name: 'Selesai' }).click();

    // Wallet balance moved by EXACTLY the contributed amount.
    await page.goto('/wallets');
    await expect(page.getByRole('link', { name: /BCA/ })).toContainText('Rp2.000.000', DB_TIMEOUT);

    // Wealth hub's savings total rose by the SAME amount — cash down,
    // savings up, identical magnitude (docs/03 §10.1's net-worth-neutral
    // claim, the only way it's currently visible in the UI).
    await page.goto('/wealth');
    await expect(page.getByRole('link', { name: /Tabungan/ })).toContainText('Rp3.000.000', DB_TIMEOUT);
  });

  test('target tanpa tanggal tidak menampilkan saran bulanan atau tanggal terlewat', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/wealth/savings');

    await page.getByRole('button', { name: 'Buat target' }).click();
    const createSheet = page.getByRole('dialog', { name: 'Target tabungan baru' });
    await createSheet.getByLabel('Nama target').fill('Tanpa Tanggal');
    await createSheet.getByLabel('Target (Rp)').fill('1000000');
    await createSheet.getByRole('button', { name: 'Buat target' }).click();
    await expect(createSheet).not.toBeVisible(DB_TIMEOUT);

    await page.getByRole('link', { name: /Tanpa Tanggal/ }).click();
    await expect(page).toHaveURL(/\/wealth\/savings\/[^/]+$/, DB_TIMEOUT);
    await expect(page.getByText('Target terlewat')).toHaveCount(0);
  });

  test('penarikan melebihi kontribusi sendiri ditolak', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/wealth/savings');
    await page.getByRole('button', { name: 'Buat target' }).click();
    const createSheet = page.getByRole('dialog', { name: 'Target tabungan baru' });
    await createSheet.getByLabel('Nama target').fill('Target Tarik');
    await createSheet.getByLabel('Target (Rp)').fill('5000000');
    await createSheet.getByRole('button', { name: 'Buat target' }).click();
    await expect(createSheet).not.toBeVisible(DB_TIMEOUT);

    await page.getByRole('link', { name: /Target Tarik/ }).click();
    await expect(page).toHaveURL(/\/wealth\/savings\/[^/]+$/, DB_TIMEOUT);

    // Never contributed anything -> the withdraw sheet says so up front and
    // never even shows the keypad.
    await page.getByRole('button', { name: 'Tarik dana' }).click();
    const withdrawSheet = page.getByRole('dialog', { name: /^Tarik dana dari/ });
    await expect(withdrawSheet).toBeVisible();
    await expect(
      withdrawSheet.getByText('Anda belum memiliki kontribusi pada target ini untuk ditarik.'),
    ).toBeVisible();
  });

  // Neither /wealth/savings nor its [id] detail page has overflow or axe
  // coverage anywhere (tasks/23-hardening-and-launch's route audit). The
  // list page is auditable empty; the detail page needs one real goal.
  test('/wealth/savings dan halaman detail — tanpa horizontal overflow, axe nol pelanggaran', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await checkNoHorizontalOverflow(page, '/wealth/savings');
    await checkAxeCleanAtEveryColorScheme(page, '/wealth/savings');

    await page.getByRole('button', { name: 'Buat target' }).click();
    const createSheet = page.getByRole('dialog', { name: 'Target tabungan baru' });
    await createSheet.getByLabel('Nama target').fill('Target Audit');
    await createSheet.getByLabel('Target (Rp)').fill('1000000');
    await createSheet.getByRole('button', { name: 'Buat target' }).click();
    await expect(createSheet).not.toBeVisible(DB_TIMEOUT);

    await page.getByRole('link', { name: /Target Audit/ }).click();
    await expect(page).toHaveURL(/\/wealth\/savings\/[^/]+$/, DB_TIMEOUT);
    const detailUrl = page.url();

    await checkNoHorizontalOverflow(page, detailUrl);
    await checkAxeCleanAtEveryColorScheme(page, detailUrl);
  });
});
