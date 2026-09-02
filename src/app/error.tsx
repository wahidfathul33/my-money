'use client';

import { AlertTriangle } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { logRouteError } from '@/lib/observability/log-route-error';

/**
 * Batas error root (docs/11-tech §10, tasks/02 "Batas Error & Loading") —
 * menangkap kegagalan tak tertangani di luar `(app)/error.tsx` (mis. di
 * `(auth)`, `onboarding`, `invite`, atau di `(app)/layout.tsx` itu sendiri).
 * Pesan mengikuti aturan penulisan docs/09-ux-states.md §4.2: sebutkan apa
 * yang terjadi, status data, dan tindakan — bukan kode teknis.
 */
export default function RootError({
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
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="bg-negative-subtle text-negative flex size-12 items-center justify-center rounded-full">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-title text-text font-semibold">Halaman gagal dimuat</h1>
        <p className="text-text-muted max-w-sm text-sm">
          Terjadi kesalahan tak terduga. Data Anda tidak berubah — coba lagi.
        </p>
      </div>
      <Button onClick={() => reset()}>Coba lagi</Button>
    </div>
  );
}
