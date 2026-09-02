'use client';

import { AlertTriangle } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { logRouteError } from '@/lib/observability/log-route-error';

/**
 * Batas error grup `(app)` — menjaga shell (nav) tetap utuh, hanya isi yang
 * diganti error (tasks/02 kriteria penerimaan). Ini bekerja karena
 * `(app)/layout.tsx` merender `<AppShell>{children}</AppShell>`: berkas ini
 * menjadi batas error UNTUK `{children}`, sehingga `AppShell` — dan nav di
 * dalamnya — tetap ter-render di atasnya di pohon komponen, tidak ikut
 * dilempar ulang.
 */
export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    logRouteError(pathname, error);
  }, [pathname, error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="bg-negative-subtle text-negative flex size-12 items-center justify-center rounded-full">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-title text-text font-semibold">Halaman ini gagal dimuat</h1>
        <p className="text-text-muted max-w-sm text-sm">
          Terjadi kesalahan tak terduga. Data Anda tidak berubah — coba lagi.
        </p>
      </div>
      <Button onClick={() => reset()}>Coba lagi</Button>
    </div>
  );
}
