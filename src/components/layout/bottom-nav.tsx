'use client';

import { MoreHorizontal, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sheet, SheetClose, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { AddTransactionSheet } from '@/features/transactions/components/add-transaction-sheet';
import type { AddTransactionSheetData } from '@/features/transactions/sheet-data';
import { cn } from '@/lib/utils';
import { beranda, isRouteActive, kekayaan, MORE_SHEET_ITEMS, transaksi } from './nav-items';
import type { NavItem } from './nav-items';

const ITEM_CLASS =
  'flex min-w-11 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium';

/**
 * Bottom nav — 5 slot mobile (<768px): Beranda · Transaksi · FAB · Kekayaan
 * · Lainnya (docs/02-IA §2). Material kaca — satu dari maksimal dua elemen
 * `backdrop-filter` di layar (docs/07 §12); sheet FAB/Lainnya di bawah
 * memakai variant="bottom" yang JUGA memakai kaca, jadi hanya SATU boleh
 * terbuka sekaligus — dijamin karena keduanya Radix Dialog Root terpisah
 * dan overlay salah satu memblokir trigger yang lain saat sudah terbuka.
 */
// Slot 1–2 (Beranda, Transaksi) dan slot 4 (Kekayaan) — lihat
// PRIMARY_NAV_ITEMS di nav-items.ts. FAB duduk di slot 3 di ANTARA
// keduanya, jadi urutan render dipecah di sini alih-alih satu `.map()` —
// urutan DOM harus sama dengan urutan visual supaya tab order logis
// (tasks/02/spec.md kriteria penerimaan "urutan fokus logis").
function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href ?? '#'}
      aria-current={active ? 'page' : undefined}
      className={cn(ITEM_CLASS, active ? 'text-brand-readable' : 'text-text-muted')}
    >
      <item.icon className="size-6" aria-hidden="true" />
      {item.label}
    </Link>
  );
}

interface BottomNavProps {
  addTransactionSheetData: AddTransactionSheetData;
}

export function BottomNav({ addTransactionSheetData }: BottomNavProps) {
  const pathname = usePathname();
  const moreActive = MORE_SHEET_ITEMS.some((item) => isRouteActive(pathname, item.href));

  return (
    <nav
      aria-label="Navigasi utama"
      className="material-glass bottom-nav fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around md:hidden"
    >
      <NavLink item={beranda} active={isRouteActive(pathname, beranda.href)} />
      <NavLink item={transaksi} active={isRouteActive(pathname, transaksi.href)} />

      {/* FAB — tidak mengubah URL (docs/02-IA "Aturan"). */}
      <AddTransactionSheet
        {...addTransactionSheetData}
        variant="bottom"
        trigger={
          <button
            type="button"
            aria-label="Tambah transaksi"
            className="pressable bg-brand-hover text-on-brand shadow-fab -mt-5 flex size-14 flex-none items-center justify-center self-center rounded-full"
          >
            <Plus className="size-6" aria-hidden="true" />
          </button>
        }
      />

      <NavLink item={kekayaan} active={isRouteActive(pathname, kekayaan.href)} />

      {/* "Lainnya" — sheet, bukan navigasi langsung. Menyediakan tempat
          untuk Keluarga sejak sekarang (nonaktif sampai task 10) —
          tasks/02/spec.md "Catatan". */}
      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-current={moreActive ? 'page' : undefined}
            className={cn(ITEM_CLASS, moreActive ? 'text-brand-readable' : 'text-text-muted')}
          >
            <MoreHorizontal className="size-6" aria-hidden="true" />
            Lainnya
          </button>
        </SheetTrigger>
        <SheetContent variant="bottom" title="Lainnya">
          <ul className="flex flex-col">
            {MORE_SHEET_ITEMS.map((item) =>
              item.href ? (
                <li key={item.label}>
                  <SheetClose asChild>
                    <Link
                      href={item.href}
                      className="pressable-tint rounded-inner text-body text-text flex h-12 items-center gap-3 px-2"
                    >
                      <item.icon className="text-text-muted size-5" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </SheetClose>
                </li>
              ) : (
                <li key={item.label}>
                  <button
                    type="button"
                    disabled
                    className="rounded-inner text-text-subtle text-body flex h-12 w-full items-center gap-3 px-2 opacity-60"
                  >
                    <item.icon className="size-5" aria-hidden="true" />
                    {item.label}
                    <span className="rounded-chip bg-surface-raised ml-auto px-2 py-0.5 text-xs">
                      Segera
                    </span>
                  </button>
                </li>
              ),
            )}
          </ul>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
