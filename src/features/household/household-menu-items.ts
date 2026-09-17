/**
 * Household-context menu — docs/02-information-architecture.md §4: "ketika
 * konteks household aktif, daftar item sidebar berganti menjadi menu
 * household (Ringkasan, Pengeluaran, Budget, Tabungan, Anggota, Kekayaan)."
 * Shared between the desktop sidebar swap (src/components/layout/sidebar.tsx)
 * and the mobile sub-nav rendered inside the household layout
 * (src/features/household/components/household-nav.tsx).
 *
 * Ringkasan and Pengaturan got real routes in task 10; Anggota's landed in
 * task 11; Anggaran's, Tabungan's, and Pengeluaran's landed together in
 * tasks 12/14/15; Kekayaan's landed in task 19
 * (`/household/[id]/net-worth`) — the last of the "reserve now, activate
 * later" slots task 02 set aside is now filled.
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
    { label: 'Pengeluaran', icon: Receipt, href: `/household/${householdId}/transactions` },
    { label: 'Anggaran', icon: PiggyBank, href: `/household/${householdId}/budgets` },
    { label: 'Tabungan', icon: Target, href: `/household/${householdId}/savings` },
    { label: 'Anggota', icon: Users, href: `/household/${householdId}/members` },
    { label: 'Kekayaan', icon: Gem, href: `/household/${householdId}/net-worth` },
    { label: 'Pengaturan', icon: Settings, href: `/household/${householdId}/settings` },
  ];
}
