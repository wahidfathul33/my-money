import type { ReactNode } from 'react';
import { BottomNav } from './bottom-nav';
import { Sidebar } from './sidebar';

/**
 * Kerangka aplikasi terautentikasi — dipakai `app/(app)/layout.tsx`.
 * Memilih bottom nav (mobile) / rail (tablet) / sidebar (desktop) lewat CSS
 * breakpoint di komponen masing-masing, bukan JS, supaya tidak ada
 * hydration mismatch dan tidak ada layout shift menunggu deteksi lebar
 * layar (tasks/02/spec.md "AppShell — memilih bottom nav / rail / sidebar
 * berdasarkan breakpoint").
 *
 * Konten dibatasi `max-w-5xl` di desktop (docs/02-IA §4) dan diberi
 * `padding-bottom` yang menghindari bottom nav + safe area di mobile
 * (`.page-content-bottom-nav-padding`, globals.css — docs/07 §11.2).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Sidebar />
      <main className="page-content-bottom-nav-padding flex flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-5xl">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
