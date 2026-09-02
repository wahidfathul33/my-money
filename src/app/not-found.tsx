'use client';

import { Compass } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { logRouteNotFound } from '@/lib/observability/log-route-error';

/**
 * 404 (docs/09-ux-states.md §4.1: "Halaman khusus", pemulihan "Kembali ke
 * daftar"). Satu berkas untuk seluruh app — cocok dengan
 * docs/11-tech-architecture.md §10 (hanya root level, tidak per grup rute).
 */
export default function NotFound() {
  const pathname = usePathname();

  useEffect(() => {
    logRouteNotFound(pathname);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="bg-surface-raised text-text-subtle flex size-12 items-center justify-center rounded-full">
        <Compass className="size-6" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-title text-text font-semibold">Halaman tidak ditemukan</h1>
        <p className="text-text-muted max-w-sm text-sm">
          Halaman yang Anda cari tidak ada atau sudah dipindahkan.
        </p>
      </div>
      {/* Bukan `<Button asChild><Link>...</Link></Button>` (docs/07 §14.1
          mendokumentasikan `asChild` persis untuk kasus ini) — Button
          selalu merender `{loading && <Loader2/>}` sebagai saudara
          `{children}`, dan Radix Slot (task 01) menghitung `false` itu
          sebagai anak kedua lalu melempar "Expected a single React element
          child", meledak SAAT BUILD (prerender /_not-found). Bug pada
          `components/ui/button.tsx` — di luar cakupan task ini untuk
          diperbaiki (lihat laporan task 02); kelas di bawah menyalin
          persis gaya `variant="primary" size="md"` sampai itu diperbaiki. */}
      <Link
        href="/"
        className="pressable rounded-input bg-brand-hover text-on-brand text-body inline-flex h-11 items-center justify-center gap-2 px-4 font-medium hover:opacity-90"
      >
        Kembali ke Beranda
      </Link>
    </div>
  );
}
