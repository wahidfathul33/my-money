import type { ReactNode } from 'react';
import type { AddTransactionSheetData } from '@/features/transactions/sheet-data';
import type { HouseholdSummary } from '@/features/household/queries';
import { ContextSwitcher } from '@/features/household/components/context-switcher';
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
 *
 * Header mobile (task 10) — docs/02-IA §3: context switcher "berada di
 * header, kiri atas". Dirender HANYA saat `households.length > 0`: seorang
 * pengguna tanpa household tidak boleh melihat jejak fitur ini sama sekali
 * (tasks/10-household-core/spec.md), jadi header itu sendiri tidak ada,
 * bukan sekadar kosong.
 */
interface AppShellProps {
  children: ReactNode;
  /** Server-fetched data for the FAB (mobile) / "+ Tambah" (desktop) Add
   * Transaction sheet — see src/app/(app)/layout.tsx. */
  addTransactionSheetData: AddTransactionSheetData;
  /** The signed-in user's active household memberships — drives the
   * context switcher and the "Keluarga"/"Buat keluarga" nav entry. */
  households: HouseholdSummary[];
  /** tasks/13-transfers-member — the Activity badge (todo.md: "Lencana
   * pada context switcher & menu Lainnya"). */
  unacknowledgedCount: number;
}

export function AppShell({ children, addTransactionSheetData, households, unacknowledgedCount }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Sidebar
        addTransactionSheetData={addTransactionSheetData}
        households={households}
        unacknowledgedCount={unacknowledgedCount}
      />
      {households.length > 0 && (
        <header className="border-border bg-surface px-page-x flex items-center border-b py-2 md:hidden">
          <ContextSwitcher households={households} variant="mobile" unacknowledgedCount={unacknowledgedCount} />
        </header>
      )}
      <main className="page-content-bottom-nav-padding flex flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-5xl">
        {children}
      </main>
      <BottomNav
        addTransactionSheetData={addTransactionSheetData}
        households={households}
        unacknowledgedCount={unacknowledgedCount}
      />
    </div>
  );
}
