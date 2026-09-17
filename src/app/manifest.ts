import type { MetadataRoute } from 'next';

/**
 * PWA manifest — docs/13-deployment-vercel.md §8. `theme_color` is the
 * project's actual `--color-brand` token (`oklch(58% 0.118 195)`,
 * src/app/globals.css) converted to sRGB hex, not the doc's illustrative
 * `#0d9488` placeholder — todo.md's "theme_color cocok dengan token merek".
 * `background_color` matches `--color-bg`'s near-white light-mode value.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyMoney — Keuangan Pribadi',
    short_name: 'MyMoney',
    description: 'Kelola pemasukan, pengeluaran, aset, dan kekayaan bersih Anda.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#008f90',
    icons: [
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
