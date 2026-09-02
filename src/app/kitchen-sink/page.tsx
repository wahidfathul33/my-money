import { notFound } from 'next/navigation';
import { KitchenSinkContent } from './kitchen-sink-content';

/**
 * Khusus dev (docs/07 catatan task 01) — tempat memverifikasi setiap
 * primitif secara visual tanpa data nyata. Rute ini tetap ada sepanjang
 * proyek, hanya disembunyikan di build produksi.
 */
export default function KitchenSinkPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <KitchenSinkContent />;
}
