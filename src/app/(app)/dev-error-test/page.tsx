import { notFound } from 'next/navigation';

/**
 * Khusus dev/test (pola sama dengan /kitchen-sink, task 01) — melempar
 * error tak tertangani secara sengaja supaya e2e dapat memverifikasi
 * `(app)/error.tsx` menjaga shell (nav) utuh dan hanya isi yang diganti
 * pesan error (tasks/02-app-shell-navigation, kriteria penerimaan).
 * Disembunyikan di build produksi.
 */
export default function ErrorTestPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  throw new Error(
    'Error sengaja untuk menguji (app)/error.tsx — lihat e2e/error-boundaries.spec.ts',
  );
}
