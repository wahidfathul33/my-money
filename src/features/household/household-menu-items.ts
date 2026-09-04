/**
 * Household-context menu — docs/02-information-architecture.md §4: "ketika
 * konteks household aktif, daftar item sidebar berganti menjadi menu
 * household (Ringkasan, Pengeluaran, Budget, Tabungan, Anggota, Kekayaan)."
 * Shared between the desktop sidebar swap (src/components/layout/sidebar.tsx)
 * and the mobile sub-nav rendered inside the household layout
 * (src/features/household/components/household-nav.tsx).
 *
 * Ringkasan and Pengaturan got real routes in task 10; Anggota's landed in
 * task 11; Anggaran's landed in task 14. The rest are still reserved,
 * `href`-less slots that light up as their owning task lands — the same
 * "reserve now, activate later" pattern task 02 used for Keluarga itself,
 * now applied one level down: Pengeluaran (task 12), Tabungan (15),
 * Kekayaan (19).
 */
import type { LucideIcon } from 'lucide-react';
import { Gem, Home, PiggyBank, Receipt, Settings, Target, Users } from 'lucide-react';

export interface HouseholdMenuItem {
  label: string;
  icon: LucideIcon;
  href?: string;
  /** Ringkasan's href (`/household/[id]`) is also a PREFIX of every other
   * item's href (`/household/[id]/settings`, …) — without an exact match it
   * would show as active on every sub-page too, the same problem `/` solves
   * for the personal Beranda item (see nav-items.ts's `isRouteActive`). */
  exact?: boolean;
}

export function getHouseholdMenuItems(householdId: string): HouseholdMenuItem[] {
  return [
    { label: 'Ringkasan', icon: Home, href: `/household/${householdId}`, exact: true },
    { label: 'Pengeluaran', icon: Receipt },
    { label: 'Anggaran', icon: PiggyBank, href: `/household/${householdId}/budgets` },
    { label: 'Tabungan', icon: Target },
    { label: 'Anggota', icon: Users, href: `/household/${householdId}/members` },
    { label: 'Kekayaan', icon: Gem },
    { label: 'Pengaturan', icon: Settings, href: `/household/${householdId}/settings` },
  ];
}
