import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';

const MOBILE_VIEWPORT = { width: 360, height: 800 };
const MIN_TARGET_PX = 44;

async function expectMinTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(
    box,
    `${await locator.evaluate((el) => el.outerHTML.slice(0, 80))} tidak terlihat`,
  ).not.toBeNull();
  expect(box!.width, 'lebar target sentuh').toBeGreaterThanOrEqual(MIN_TARGET_PX);
  expect(box!.height, 'tinggi target sentuh').toBeGreaterThanOrEqual(MIN_TARGET_PX);
}

test.describe('/kitchen-sink', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/kitchen-sink');
  });

  // Diuji eksplisit di KEDUA skema warna — bukan cuma default browser.
  // Bug nyata sempat lolos di sini: token mode gelap sebelumnya salah
  // bersarang (`@theme` di dalam `@media`), yang membuat SATU projek
  // Playwright (kebetulan default gelap) menangkapnya sementara yang lain
  // (kebetulan default terang) tidak. Lihat globals.css & laporan task 01.
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`axe melaporkan nol pelanggaran (mode ${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.reload();
      // Dibatasi ke <main> — chrome dev Next.js sendiri (tombol "Open
      // Next.js Dev Tools" dkk.) bukan bagian dari halaman yang dibangun
      // task ini dan tidak akan ada di build produksi.
      const results = await new AxeBuilder({ page }).include('main').analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  }

  test('tidak ada horizontal overflow di 360px', async ({ page }) => {
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  });

  test('setiap tombol yang terlihat berukuran >= 44x44px', async ({ page }) => {
    // Dibatasi ke <main> — lihat komentar di test axe di atas.
    const buttons = await page.locator('main').getByRole('button').all();
    let checked = 0;
    for (const button of buttons) {
      if (!(await button.isVisible())) continue;
      await expectMinTouchTarget(button);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  test('setiap input teks berukuran >= 44px tinggi dan font-size >= 16px', async ({ page }) => {
    const inputs = await page.locator('main').getByRole('textbox').all();
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      const box = await input.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      const fontSize = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      // >=16px — di bawah itu iOS Safari melakukan zoom otomatis saat fokus.
      expect(fontSize).toBeGreaterThanOrEqual(16);
    }
  });

  test('dropdown (Select trigger) berukuran >= 44px tinggi', async ({ page }) => {
    const combobox = page.locator('main').getByRole('combobox').first();
    await expectMinTouchTarget(combobox);
  });

  test('switch dibungkus target sentuh >= 44x44px meski thumb visualnya lebih kecil', async ({
    page,
  }) => {
    const switches = await page.locator('main').getByRole('switch').all();
    expect(switches.length).toBeGreaterThan(0);
    for (const sw of switches) {
      const box = await sw.evaluate((el) => el.parentElement!.getBoundingClientRect().toJSON());
      expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    }
  });

  test('baris checkbox & radio (kontrol + label) berukuran >= 44px tinggi', async ({ page }) => {
    const main = page.locator('main');
    const controls = [
      ...(await main.getByRole('checkbox').all()),
      ...(await main.getByRole('radio').all()),
    ];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      const height = await control.evaluate(
        (el) => el.closest('div')!.getBoundingClientRect().height,
      );
      expect(height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    }
  });

  test('tab trigger berukuran >= 44px tinggi', async ({ page }) => {
    const tabs = await page.locator('main').getByRole('tab').all();
    expect(tabs.length).toBeGreaterThan(0);
    for (const tab of tabs) {
      const box = await tab.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    }
  });

  test('tombol aksi & tutup Toast berukuran >= 44x44px', async ({ page }) => {
    await page.locator('main').getByRole('button', { name: 'Toast error + undo' }).click();
    const closeButton = page.getByRole('button', { name: 'Tutup notifikasi' });
    await expect(closeButton).toBeVisible();
    await expectMinTouchTarget(closeButton);
    await expectMinTouchTarget(page.getByRole('button', { name: 'Urungkan' }));
  });

  test('Sheet naik dari bawah, fokus terjebak, dan kembali ke pemicu saat ditutup', async ({
    page,
  }) => {
    const trigger = page.locator('main').getByRole('button', { name: 'Buka sheet (bottom)' });
    await trigger.click();
    const sheet = page.getByRole('dialog', { name: 'Pilih dompet' });
    await expect(sheet).toBeVisible();

    // Fokus terjebak: Tab berulang kali tetap berada di dalam sheet.
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    const activeInsideSheet = await sheet.evaluate((sheetEl) =>
      sheetEl.contains(document.activeElement),
    );
    expect(activeInsideSheet).toBe(true);

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('prefers-reduced-motion mematikan transisi transform, menyisakan fade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const durationSeconds = await page.evaluate(() => {
      const probe = document.createElement('button');
      probe.className = 'pressable';
      document.body.appendChild(probe);
      // getComputedStyle selalu mengembalikan detik (mis. "1e-05s" untuk
      // 0.01ms) — parse sebagai angka alih-alih mencocokkan string mentah.
      const value = parseFloat(getComputedStyle(probe).transitionDuration);
      probe.remove();
      return value;
    });
    // 0.01ms == 0.00001s (dipaksa lewat prefers-reduced-motion di globals.css).
    expect(durationSeconds).toBeLessThanOrEqual(0.0001);
  });
});
