import { notFound } from 'next/navigation';

/**
 * Khusus dev/test — di LUAR grup `(app)`, jadi kegagalannya ditangkap
 * `app/error.tsx` (root), bukan `app/(app)/error.tsx`. Membuktikan kedua
 * level batas error ada dan berfungsi terpisah (docs/11-tech §10,
 * tasks/02-app-shell-navigation). Disembunyikan di build produksi.
 */
export default function RootErrorTestPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  throw new Error('Error sengaja untuk menguji app/error.tsx — lihat e2e/error-boundaries.spec.ts');
}
