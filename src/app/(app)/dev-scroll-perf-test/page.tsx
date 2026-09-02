import { notFound } from 'next/navigation';

/**
 * Khusus dev/test — daftar 200 baris dengan bottom nav berkaca aktif di
 * atasnya, untuk mendekati kriteria penerimaan "daftar 200 item tetap
 * >=55fps di perangkat menengah dengan nav berkaca aktif"
 * (tasks/02-app-shell-navigation/spec.md). Lihat
 * e2e/scroll-performance.spec.ts untuk metodologi pengukuran & batasannya.
 * Disembunyikan di build produksi.
 */
export default function ScrollPerfTestPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div data-testid="scroll-perf-list" className="flex flex-col">
      {Array.from({ length: 200 }, (_, i) => (
        <div key={i} className="list-row border-separator flex h-14 items-center border-b px-4">
          Baris {i + 1}
        </div>
      ))}
    </div>
  );
}
