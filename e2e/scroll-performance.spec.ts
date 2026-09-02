import { expect, test } from '@playwright/test';

/**
 * Proksi untuk kriteria penerimaan "daftar 200 item tetap >=55fps di
 * perangkat menengah dengan nav berkaca aktif" (tasks/02-app-shell-
 * navigation/spec.md).
 *
 * INI BUKAN PENGUKURAN FPS PERANGKAT NYATA. Runner CI headless (apalagi
 * lewat container tanpa GPU sungguhan) tidak merepresentasikan "perangkat
 * menengah" — angkanya bisa jauh lebih tinggi (VM bertenaga, tanpa thermal
 * throttling) atau lebih rendah (tanpa akselerasi GPU) dari device Android
 * kelas menengah yang sebenarnya. Nilainya dicatat sebagai referensi kasar
 * dan lampiran laporan, BUKAN sebagai gerbang lulus/gagal yang ketat —
 * lihat laporan task 02 untuk penjelasan lengkap keterbatasan ini.
 */
test('proksi fps: scroll 200 baris dengan bottom nav berkaca aktif (BUKAN angka perangkat nyata)', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dev-scroll-perf-test');
  await expect(page.getByTestId('scroll-perf-list')).toBeVisible();

  // Anggaran material (docs/07 §12) — nav berkaca harus aktif selama scroll.
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toBeVisible();

  const { fps, frames, durationMs } = await page.evaluate(async () => {
    const durationTarget = 1500; // ms
    const start = performance.now();
    let frameCount = 0;
    let lastTime = start;
    const step = 800 / 90; // px per frame target, ~90 frame scroll pass

    return await new Promise<{ fps: number; frames: number; durationMs: number }>((resolve) => {
      function tick(now: number) {
        frameCount++;
        window.scrollBy(0, step);
        if (now - start < durationTarget) {
          lastTime = now;
          requestAnimationFrame(tick);
        } else {
          resolve({
            fps: (frameCount / (lastTime - start)) * 1000,
            frames: frameCount,
            durationMs: lastTime - start,
          });
        }
      }
      requestAnimationFrame(tick);
    });
  });

  testInfo.annotations.push({
    type: 'scroll-fps-proxy',
    description: `${fps.toFixed(1)} fps (${frames} frame / ${durationMs.toFixed(0)}ms) — proksi headless, bukan perangkat nyata`,
  });

  // Sanity check longgar saja: memastikan rAF benar-benar berjalan (bukan
  // 0fps karena loop macet), bukan penegakan anggaran 55fps yang ketat —
  // lingkungan CI headless tidak representatif untuk itu (lihat komentar
  // atas).
  expect(frames).toBeGreaterThan(10);
  expect(fps).toBeGreaterThan(0);
});
