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
  /** `undefined` — slot dicadangkan tapi belum bisa dinavigasi. */
  href?: string;
  /** Cocok persis saja, bukan prefix — dibutuhkan item yang href-nya juga
   * merupakan prefix item lain (mis. Ringkasan household vs Pengaturan
   * household). Default `false` (prefix match, seperti sebelumnya). */
  exact?: boolean;
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

/**
 * Keluarga — dinamis sejak task 10 (docs/02-IA §2 "Kenapa Keluarga tidak
 * mendapat slot sendiri"; tasks/10-household-core/spec.md kriteria
 * penerimaan: "Pengguna tanpa household tidak melihat elemen household
 * apa pun — switcher tersembunyi, hanya ada satu entri 'Buat keluarga' di
 * menu Lainnya"). Selalu punya href sekarang — tidak ada lagi slot
 * "Segera" nonaktif untuk item ini.
 */
export function getKeluargaNavItem(hasHousehold: boolean): NavItem {
  return hasHousehold
    ? { label: 'Keluarga', icon: Users, href: '/household' }
    : { label: 'Buat keluarga', icon: Users, href: '/household/new' };
}

// Urutan sheet "Lainnya" (bottom nav slot 5) — docs/02-IA §2 tabel: "Sheet
// menu → Keluarga, Dompet, Budget, Laporan, Pengaturan".
export function getMoreSheetItems(hasHousehold: boolean): NavItem[] {
  return [getKeluargaNavItem(hasHousehold), dompet, anggaran, laporan, pengaturan];
}

// Urutan sidebar desktop / rail tablet — docs/02-IA §4 diagram: Home,
// Transaksi, Kekayaan, Dompet, Budget, Laporan, Keluarga, Settings.
export function getSidebarItems(hasHousehold: boolean): NavItem[] {
  return [
    ...PRIMARY_NAV_ITEMS,
    dompet,
    anggaran,
    laporan,
    getKeluargaNavItem(hasHousehold),
    pengaturan,
  ];
}

/**
 * Aktif untuk rute persis atau nested route di bawahnya ("berfungsi pada
 * nested route" — tasks/02/spec.md kriteria penerimaan). `/` hanya cocok
 * persis, jika tidak `/wallets` akan selalu tersorot aktif (prefix kosong).
 * `exact` (task 10) memperluas kasus itu ke item lain yang href-nya juga
 * prefix dari href item lain.
 */
export function isRouteActive(pathname: string, href: string | undefined, exact = false): boolean {
  if (!href) return false;
  if (href === '/' || exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
