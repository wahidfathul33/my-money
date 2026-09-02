import type { LucideIcon } from 'lucide-react';
import { BarChart3, Gem, Home, PiggyBank, Receipt, Settings, Users, Wallet } from 'lucide-react';

/**
 * Satu sumber kebenaran untuk item navigasi — dipakai BottomNav (mobile),
 * Sidebar (rail tablet + sidebar desktop). Label mengikuti
 * docs/08-copywriting.md §5.1 ("Beranda", bukan "Home"; "Anggaran", bukan
 * "Budget"), rute mengikuti docs/02-information-architecture.md §1.
 */
export interface NavItem {
  label: string;
  icon: LucideIcon;
  /** `undefined` — slot dicadangkan tapi belum bisa dinavigasi (Keluarga,
   * sampai task 10 menambahkan context switcher & rute household). */
  href?: string;
}

// Item bernama satu per satu (bukan destructuring array) — dengan
// `noUncheckedIndexedAccess` aktif (tsconfig.json), indeks array selalu
// bertipe `T | undefined`; BottomNav butuh Beranda/Transaksi/Kekayaan
// terpisah untuk menyisipkan FAB di antaranya (lihat bottom-nav.tsx).
const beranda: NavItem = { label: 'Beranda', icon: Home, href: '/' };
const transaksi: NavItem = { label: 'Transaksi', icon: Receipt, href: '/transactions' };
const kekayaan: NavItem = { label: 'Kekayaan', icon: Gem, href: '/wealth' };

// Tiga slot bottom nav yang menavigasi langsung (di luar FAB dan "Lainnya").
export const PRIMARY_NAV_ITEMS: NavItem[] = [beranda, transaksi, kekayaan];
// Diekspor terpisah untuk BottomNav — lihat komentar di atas.
export { beranda, transaksi, kekayaan };

const dompet: NavItem = { label: 'Dompet', icon: Wallet, href: '/wallets' };
const anggaran: NavItem = { label: 'Anggaran', icon: PiggyBank, href: '/budgets' };
const laporan: NavItem = { label: 'Laporan', icon: BarChart3, href: '/reports' };
const pengaturan: NavItem = { label: 'Pengaturan', icon: Settings, href: '/settings' };
// Slot dicadangkan sejak task 02 (docs/02-IA §2 "Kenapa Keluarga tidak
// mendapat slot sendiri", catatan tasks/02/spec.md) — tautan aktif di task
// 10 setelah ada context switcher & rute /household.
const keluarga: NavItem = { label: 'Keluarga', icon: Users };

// Urutan sheet "Lainnya" (bottom nav slot 5) — docs/02-IA §2 tabel: "Sheet
// menu → Keluarga, Dompet, Budget, Laporan, Pengaturan".
export const MORE_SHEET_ITEMS: NavItem[] = [keluarga, dompet, anggaran, laporan, pengaturan];

// Urutan sidebar desktop / rail tablet — docs/02-IA §4 diagram: Home,
// Transaksi, Kekayaan, Dompet, Budget, Laporan, Keluarga, Settings.
export const SIDEBAR_ITEMS: NavItem[] = [
  ...PRIMARY_NAV_ITEMS,
  dompet,
  anggaran,
  laporan,
  keluarga,
  pengaturan,
];

/**
 * Aktif untuk rute persis atau nested route di bawahnya ("berfungsi pada
 * nested route" — tasks/02/spec.md kriteria penerimaan). `/` hanya cocok
 * persis, jika tidak `/wallets` akan selalu tersorot aktif (prefix kosong).
 */
export function isRouteActive(pathname: string, href: string | undefined): boolean {
  if (!href) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
