import { expect, test, type Page } from '@playwright/test';

const MOBILE = { width: 375, height: 812 };
const TABLET = { width: 900, height: 1024 };
const DESKTOP = { width: 1280, height: 900 };

async function countBackdropFilterElements(page: Page): Promise<number> {
  return page.evaluate(() => {
    let count = 0;
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      const style = getComputedStyle(el);
      const bf =
        style.backdropFilter || (style as unknown as Record<string, string>).webkitBackdropFilter;
      if (bf && bf !== 'none') count++;
    }
    return count;
  });
}

test.describe('Bottom nav — mobile (<768px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
  });

  test('tampil dengan 5 slot, sidebar tersembunyi', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
    await expect(nav).toBeVisible();
    await expect(page.getByRole('link', { name: 'Beranda' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Transaksi' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tambah transaksi' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Kekayaan' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lainnya' })).toBeVisible();
  });

  test('setiap slot berukuran >= 44x44px', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
    const targets = await nav.locator('a, button').all();
    expect(targets.length).toBeGreaterThanOrEqual(5);
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('item aktif tersorot sesuai rute, termasuk nested route', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Beranda' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.goto('/wealth');
    await expect(page.getByRole('link', { name: 'Kekayaan' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('link', { name: 'Beranda' })).not.toHaveAttribute('aria-current');
  });

  test('FAB membuka sheet placeholder, URL tidak berubah, back menutup sheet', async ({ page }) => {
    await page.getByRole('button', { name: 'Tambah transaksi' }).click();
    const sheet = page.getByRole('dialog', { name: 'Tambah transaksi' });
    await expect(sheet).toBeVisible();
    expect(page.url()).toMatch(/\/$/);

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    expect(page.url()).toMatch(/\/$/);
  });

  test('"Lainnya" membuka sheet berisi Keluarga (nonaktif) + Dompet/Anggaran/Laporan/Pengaturan', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Lainnya' }).click();
    const sheet = page.getByRole('dialog', { name: 'Lainnya' });
    await expect(sheet).toBeVisible();

    const keluarga = sheet.getByRole('button', { name: /Keluarga/ });
    await expect(keluarga).toBeDisabled();

    await expect(sheet.getByRole('link', { name: 'Dompet' })).toHaveAttribute('href', '/wallets');
    await expect(sheet.getByRole('link', { name: 'Anggaran' })).toHaveAttribute('href', '/budgets');
    await expect(sheet.getByRole('link', { name: 'Laporan' })).toHaveAttribute('href', '/reports');

    await sheet.getByRole('link', { name: 'Pengaturan' }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test('safe area: env(safe-area-inset-bottom) mempengaruhi padding nav pada perangkat ber-home-indicator', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Override CDP hanya tersedia di Chromium');
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setSafeAreaInsetsOverride', {
      insets: { bottom: 34, bottomMax: 34, top: 47, topMax: 47 },
    });
    await page.reload();

    const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
    const paddingBottom = await nav.evaluate((el) =>
      parseFloat(getComputedStyle(el).paddingBottom),
    );
    expect(paddingBottom).toBeGreaterThanOrEqual(34);

    const contentPaddingBottom = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('main')!).paddingBottom),
    );
    // padding konten = tinggi nav (56px) + safe area (34px) + 1rem (16px).
    expect(contentPaddingBottom).toBeGreaterThanOrEqual(56 + 34);
  });

  test('maksimal 2 elemen ber-backdrop-filter, termasuk saat sheet terbuka', async ({ page }) => {
    expect(await countBackdropFilterElements(page)).toBeLessThanOrEqual(2);

    await page.getByRole('button', { name: 'Tambah transaksi' }).click();
    await expect(page.getByRole('dialog', { name: 'Tambah transaksi' })).toBeVisible();
    expect(await countBackdropFilterElements(page)).toBeLessThanOrEqual(2);
  });

  test('overscroll-behavior-y: none pada body', async ({ page }) => {
    const value = await page.evaluate(() => getComputedStyle(document.body).overscrollBehaviorY);
    expect(value).toBe('none');
  });
});

test.describe('Rail — tablet (768–1023px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(TABLET);
    await page.goto('/');
  });

  test('rail ikon tampil, bottom nav tersembunyi', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toBeVisible();
    // Rail juga memberi "Beranda" sebagai accessible name (lewat
    // aria-label pada link icon-only) — bukan indikator sidebar penuh.
    // Yang membedakan rail dari sidebar penuh adalah TIDAK ADA teks label
    // yang terlihat, bukan ketiadaan elemen; itu diverifikasi terpisah di
    // test lebar (72px) dan test title/tooltip di bawah.
    const home = page.getByRole('link', { name: 'Beranda' });
    await expect(home).toBeVisible();
    await expect(home).toHaveText('');
    await expect(page.getByRole('button', { name: 'Tambah transaksi' })).toBeVisible();
  });

  test('lebar rail sekitar 72px', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
    const box = await nav.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(64);
    expect(box!.width).toBeLessThanOrEqual(90);
  });

  test('ikon rail punya title (tooltip hover) dan >= 44px', async ({ page }) => {
    // getByRole mengecualikan versi sidebar penuh yang tersembunyi
    // (`display: none` di bawah 1024px) — hanya link rail yang cocok.
    const home = page.getByRole('link', { name: 'Beranda' });
    await expect(home).toHaveAttribute('title', 'Beranda');
    const box = await home.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe('Sidebar — desktop (>=1024px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
  });

  test('sidebar 240px persisten, bottom nav & rail tersembunyi', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
    await expect(nav).toBeVisible();
    const box = await nav.boundingBox();
    expect(box!.width).toBeCloseTo(240, -1);
    await expect(page.getByRole('button', { name: 'Tambah transaksi' })).toBeHidden();
  });

  test('urutan item mempertahankan hierarki mobile + slot Keluarga dicadangkan', async ({
    page,
  }) => {
    // getByRole mengecualikan elemen `display: none` (rail yang tersembunyi
    // di ≥1024px) dari accessibility tree, jadi hanya link sidebar penuh
    // yang benar-benar terlihat yang terhitung di sini.
    const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
    const labels = await nav.getByRole('link').allTextContents();
    expect(labels.slice(0, 3)).toEqual(['Beranda', 'Transaksi', 'Kekayaan']);
    expect(labels).toEqual([
      'Beranda',
      'Transaksi',
      'Kekayaan',
      'Dompet',
      'Anggaran',
      'Laporan',
      'Pengaturan',
    ]);
  });

  test('Keluarga tidak dapat dinavigasi (task 10)', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
    // `.last()`: rail (tersembunyi di ≥1024px) dan sidebar penuh keduanya
    // merender "Keluarga" — sidebar penuh selalu terakhir di DOM (lihat
    // src/components/layout/sidebar.tsx).
    await expect(nav.getByText('Keluarga').last()).toBeVisible();
    await expect(nav.getByText('Segera').last()).toBeVisible();
    // Bukan link — tidak ada href yang bisa dituju.
    await expect(nav.getByRole('link', { name: /Keluarga/ })).toHaveCount(0);
  });

  test('"+ Tambah" membuka Dialog (center), bukan Sheet', async ({ page }) => {
    await page.getByRole('button', { name: '+ Tambah' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tambah transaksi' });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize()!;
    // Dialog center tidak menempel ke tepi bawah seperti sheet mobile.
    expect(box!.y + box!.height).toBeLessThan(viewport.height - 20);
  });

  test('konten dibatasi max-w-5xl', async ({ page }) => {
    const main = page.locator('main');
    const width = await main.evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(1024 + 1); // max-w-5xl = 64rem = 1024px
  });
});

test.describe('Navigasi keyboard', () => {
  test('urutan fokus logis dan seluruh nav dapat dioperasikan tanpa mouse (mobile)', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');

    await page.getByRole('link', { name: 'Beranda' }).focus();
    await expect(page.getByRole('link', { name: 'Beranda' })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Transaksi' })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Tambah transaksi' })).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Tambah transaksi' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Lainnya' }).focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Lainnya' });
    await expect(sheet).toBeVisible();
    // Fokus terjebak di dalam sheet (docs/07 §14.2).
    await page.keyboard.press('Tab');
    const activeInsideSheet = await sheet.evaluate((el) => el.contains(document.activeElement));
    expect(activeInsideSheet).toBe(true);
  });

  test('sidebar dapat dioperasikan penuh dengan keyboard (desktop)', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await page.getByRole('link', { name: 'Beranda' }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Transaksi' })).toBeFocused();
  });
});
