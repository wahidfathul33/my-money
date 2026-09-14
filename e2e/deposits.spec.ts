import { expect, test } from './fixtures/authenticated';

/**
 * tasks/17-assets-deposits/spec.md verification: "buat deposito → estimasi
 * tampil → cairkan → saldo naik". Authenticated via
 * e2e/fixtures/authenticated.ts (auto-seeds a real, onboarded session with
 * a starter "Tunai" wallet at balance 0 — a funded "BCA" wallet is created
 * explicitly below, same pattern as e2e/savings.spec.ts).
 *
 * The deposit's bank name ("Bank Mandiri") is deliberately different from
 * the funding wallet's name ("BCA") so text assertions can't accidentally
 * match the wrong element.
 *
 * Interest earned between "create" and "withdraw" in this flow is exactly
 * Rp0 by construction (both happen the same UTC calendar day, and
 * `daysBetweenUtc` — src/lib/finance/deposit.ts — measures whole days), so
 * the post-withdrawal wallet balance is asserted back to EXACTLY the
 * pre-deposit amount, not "increased by some interest-bearing amount" —
 * deterministic, no reliance on hand-verified interest math (that's what
 * src/lib/finance/__tests__/deposit.test.ts and
 * src/lib/services/__tests__/deposits.integration.test.ts already cover in
 * depth). The early-withdrawal warning is still exercised: `maturityDate`
 * is set comfortably in the future, so withdrawing immediately is
 * genuinely "before jatuh tempo" regardless of the interest being zero.
 */
const DB_TIMEOUT = { timeout: 20000 };

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test.describe('Deposito', () => {
  test.describe.configure({ retries: 2 });

  test('buat deposito -> estimasi tampil berlabel -> cairkan -> saldo dompet naik kembali', async ({ page }) => {
    test.setTimeout(120_000);

    // A funded wallet to fund the deposit FROM.
    await page.goto('/wallets');
    await page.getByRole('button', { name: 'Tambah dompet' }).click();
    const walletSheet = page.getByRole('dialog', { name: 'Tambah dompet' });
    await walletSheet.getByLabel('Nama dompet').fill('BCA');
    await walletSheet.getByLabel('Saldo awal (Rp)').fill('50000000');
    await walletSheet.getByRole('button', { name: 'Tambah dompet' }).click();
    await expect(walletSheet).not.toBeVisible(DB_TIMEOUT);
    await expect(page.getByRole('link', { name: /BCA/ })).toContainText('Rp50.000.000', DB_TIMEOUT);

    await page.goto('/wealth/assets/deposits');
    await expect(page.getByText('Belum ada deposito', { exact: true })).toBeVisible(DB_TIMEOUT);

    await page.getByRole('button', { name: 'Tambah deposito' }).click();
    const createSheet = page.getByRole('dialog', { name: 'Deposito baru' });
    await expect(createSheet).toBeVisible();

    await createSheet.getByLabel('Nama bank').fill('Bank Mandiri');
    await createSheet.getByLabel('Pokok (Rp)').fill('10000000');
    await createSheet.getByLabel('Suku bunga (% per tahun)').fill('4.25');
    await createSheet.getByLabel('Tanggal jatuh tempo').fill(isoDateOffset(180));

    await createSheet.getByRole('combobox', { name: 'Dompet sumber' }).click();
    await page.getByRole('option', { name: 'BCA' }).click();

    await createSheet.getByRole('button', { name: 'Buat deposito' }).click();
    await expect(createSheet).not.toBeVisible(DB_TIMEOUT);

    // Estimate shown, clearly labeled — never bare, per ADR-013.
    await expect(page.getByRole('link', { name: /Bank Mandiri/ })).toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('estimasi, setelah pajak 20%').first()).toBeVisible();

    // Wallet debited by EXACTLY the principal.
    await page.goto('/wallets');
    await expect(page.getByRole('link', { name: /BCA/ })).toContainText('Rp40.000.000', DB_TIMEOUT);

    // Withdraw from the detail page — navigate back first; `getByRole`
    // locators are re-queried against whatever page is CURRENT at
    // interaction time, and we just navigated away to /wallets above.
    await page.goto('/wealth/assets/deposits');
    await page.getByRole('link', { name: /Bank Mandiri/ }).click();
    await expect(page).toHaveURL(/\/wealth\/assets\/deposits\/[^/]+$/, DB_TIMEOUT);
    await expect(page.getByText('estimasi, setelah pajak 20%')).toBeVisible(DB_TIMEOUT);

    await page.getByRole('button', { name: 'Cairkan' }).click();
    const withdrawSheet = page.getByRole('dialog', { name: /^Cairkan deposito/ });
    await expect(withdrawSheet).toBeVisible();
    await expect(withdrawSheet.getByText(/sebelum jatuh tempo/)).toBeVisible(); // early-withdrawal warning

    await withdrawSheet.getByRole('button', { name: 'Cairkan deposito' }).click();
    await expect(withdrawSheet).not.toBeVisible(DB_TIMEOUT);
    await expect(page.getByText('Deposito dicairkan', { exact: true })).toBeVisible(DB_TIMEOUT);

    // Wallet balance rises back — same-day withdrawal, so exactly to the
    // original amount (see file header on why this is deterministic).
    await page.goto('/wallets');
    await expect(page.getByRole('link', { name: /BCA/ })).toContainText('Rp50.000.000', DB_TIMEOUT);

    // Withdrawn deposit drops off the main list (src/features/assets/deposits/queries.ts's `listDeposits`).
    await page.goto('/wealth/assets/deposits');
    await expect(page.getByText('Belum ada deposito', { exact: true })).toBeVisible(DB_TIMEOUT);
  });

  test('pokok di bawah ambang Rp7,5 juta menampilkan estimasi bebas pajak', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/wealth/assets/deposits');
    await page.getByRole('button', { name: 'Tambah deposito' }).click();
    const createSheet = page.getByRole('dialog', { name: 'Deposito baru' });
    await expect(createSheet).toBeVisible();

    await createSheet.getByLabel('Nama bank').fill('BRI');
    await createSheet.getByLabel('Pokok (Rp)').fill('5000000'); // di bawah Rp7.500.000
    await createSheet.getByLabel('Suku bunga (% per tahun)').fill('4');
    await createSheet.getByLabel('Tanggal jatuh tempo').fill(isoDateOffset(180));
    await expect(createSheet.getByText(/Bebas PPh/)).toBeVisible(); // penjelasan real-time saat mengetik pokok

    await createSheet.getByRole('button', { name: 'Buat deposito' }).click();
    await expect(createSheet).not.toBeVisible(DB_TIMEOUT);

    await expect(page.getByText('estimasi, bebas pajak', { exact: false }).first()).toBeVisible(DB_TIMEOUT);
  });
});
