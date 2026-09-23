'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { CountBadge } from '@/components/ui/count-badge';
import { AddTransactionSheet } from '@/features/transactions/components/add-transaction-sheet';
import type { AddTransactionSheetData } from '@/features/transactions/sheet-data';
import type { HouseholdSummary } from '@/features/household/queries';
import { ContextSwitcher } from '@/features/household/components/context-switcher';
import { getHouseholdMenuItems } from '@/features/household/household-menu-items';
import { cn } from '@/lib/utils';
import { aktivitas, getSidebarItems, isRouteActive } from './nav-items';
import type { NavItem } from './nav-items';

/**
 * "+ Tambah" desktop/tablet — Dialog (center), padanan FAB mobile, komponen
 * sama dengan varian presentasi berbeda (docs/02-IA §4, docs/07 §14.1).
 * Dialog center TIDAK memakai `material-glass` (lihat CONTENT_VARIANT_CLASS
 * di sheet.tsx), jadi tidak ikut dihitung dalam anggaran 2 backdrop-filter.
 */
function AddEntryDialog({
  trigger,
  addTransactionSheetData,
}: {
  trigger: ReactNode;
  addTransactionSheetData: AddTransactionSheetData;
}) {
  return <AddTransactionSheet {...addTransactionSheetData} variant="center" trigger={trigger} />;
}

/** `/household/[id]/...` (but not `/household` or `/household/new`, which
 * are personal-context routes) → the id, if it's one of the caller's own
 * active households. Anything else → `null`, meaning "personal context". */
function activeHouseholdFrom(pathname: string, households: HouseholdSummary[]): HouseholdSummary | null {
  const id = pathname.match(/^\/household\/([^/]+)/)?.[1];
  if (!id) return null;
  return households.find((h) => h.id === id) ?? null;
}

/**
 * Rail (768–1023px) & sidebar (≥1024px) — satu komponen, dua render
 * bergantung breakpoint viewport murni CSS (bukan `matchMedia` di JS):
 * tidak ada risiko hydration mismatch, dan hanya satu varian yang benar-benar
 * ada di accessibility tree pada satu waktu (`display: none` dikeluarkan
 * dari urutan fokus secara otomatis).
 *
 * Sejak task 10: saat konteks household aktif (URL `/household/[id]/...`),
 * daftar item berganti seluruhnya ke menu household — docs/02-IA §4:
 * "ketika konteks household aktif, daftar item sidebar berganti menjadi
 * menu household". Context switcher (di atas daftar item) tetap ada di
 * kedua konteks, dan hanya dirender saat user punya minimal satu household
 * (tasks/10-household-core/spec.md — switcher tersembunyi sepenuhnya
 * sampai saat itu).
 *
 * Catatan Tooltip: `components/ui/tooltip.tsx` (task 01) membungkus
 * children-nya sendiri di dalam `<button>` — cocok untuk visual statis
 * (lihat kitchen-sink), tapi tidak bisa membungkus `<Link>` tanpa
 * menghasilkan kontrol interaktif bersarang (`button` > `a`), yang
 * melanggar HTML valid dan pasti tertangkap axe. Rail karena itu memakai
 * `title`/`aria-label` native untuk tooltip hover — bukan komponen Tooltip
 * — kecuali pada slot Keluarga yang memang non-interaktif (`span`).
 */
interface SidebarProps {
  addTransactionSheetData: AddTransactionSheetData;
  households: HouseholdSummary[];
  /** tasks/13-transfers-member — badges both the rail icon and the full
   * sidebar's Aktivitas row (todo.md: "Lencana pada context switcher &
   * menu Lainnya"; the rail/sidebar is this app's desktop equivalent of
   * "Lainnya", per docs/02-IA §4). */
  unacknowledgedCount: number;
}

export function Sidebar({ addTransactionSheetData, households, unacknowledgedCount }: SidebarProps) {
  const pathname = usePathname();
  const activeHousehold = activeHouseholdFrom(pathname, households);
  const items: NavItem[] = activeHousehold
    ? getHouseholdMenuItems(activeHousehold.id)
    : getSidebarItems(households.length > 0);

  return (
    <nav
      aria-label="Navigasi utama"
      className="border-border bg-surface hidden shrink-0 flex-col border-r md:flex md:w-[72px] lg:w-60"
    >
      {/* Rail — 768–1023px */}
      <div className="flex flex-col items-center gap-2 py-4 lg:hidden">
        <AddEntryDialog
          addTransactionSheetData={addTransactionSheetData}
          trigger={
            <button
              type="button"
              title="Tambah transaksi"
              aria-label="Tambah transaksi"
              className="pressable bg-brand-hover text-on-brand mb-2 flex size-11 items-center justify-center rounded-full"
            >
              <Plus className="size-5" aria-hidden="true" />
            </button>
          }
        />
        {items.map((item) => {
          if (!item.href) {
            return (
              <span
                key={item.label}
                title={`${item.label} — segera hadir`}
                className="text-text-subtle flex size-11 items-center justify-center opacity-50"
              >
                <item.icon className="size-6" aria-hidden="true" />
                <span className="sr-only">{item.label} — segera hadir</span>
              </span>
            );
          }
          const active = isRouteActive(pathname, item.href, item.exact);
          const isAktivitas = item.href === aktivitas.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              title={item.label}
              aria-label={
                isAktivitas && unacknowledgedCount > 0
                  ? `${item.label}, ${unacknowledgedCount} belum ditinjau`
                  : item.label
              }
              aria-current={active ? 'page' : undefined}
              className={cn(
                'pressable-tint relative flex size-11 items-center justify-center rounded-full',
                active ? 'text-brand-readable bg-brand-subtle' : 'text-text-muted',
              )}
            >
              <item.icon className="size-6" aria-hidden="true" />
              {isAktivitas && unacknowledgedCount > 0 && (
                <CountBadge count={unacknowledgedCount} className="absolute top-1 right-1" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Sidebar penuh — ≥1024px */}
      <div className="hidden lg:flex lg:h-full lg:flex-col lg:gap-1 lg:px-3 lg:py-4">
        <div className="text-title text-text px-3 pb-4 font-semibold">MyMoney</div>
        {households.length > 0 && (
          <div className="px-3 pb-4">
            <ContextSwitcher households={households} variant="desktop" unacknowledgedCount={unacknowledgedCount} />
          </div>
        )}
        <ul className="flex flex-1 flex-col gap-1">
          {items.map((item) => (
            <li key={item.label}>
              {item.href ? (
                <Link
                  href={item.href}
                  aria-current={isRouteActive(pathname, item.href, item.exact) ? 'page' : undefined}
                  aria-label={
                    item.href === aktivitas.href && unacknowledgedCount > 0
                      ? `${item.label}, ${unacknowledgedCount} belum ditinjau`
                      : undefined
                  }
                  className={cn(
                    'pressable-tint rounded-inner flex h-11 items-center gap-3 px-3 text-sm font-medium',
                    isRouteActive(pathname, item.href, item.exact)
                      ? 'text-brand-readable bg-brand-subtle'
                      : 'text-text',
                  )}
                >
                  <item.icon className="size-5" aria-hidden="true" />
                  {item.label}
                  {item.href === aktivitas.href && (
                    <CountBadge count={unacknowledgedCount} className="ml-auto" />
                  )}
                </Link>
              ) : (
                <div className="text-text-muted flex h-11 items-center gap-3 px-3 text-sm opacity-60">
                  <item.icon className="size-5" aria-hidden="true" />
                  {item.label}
                  <span className="rounded-chip bg-surface-raised ml-auto px-2 py-0.5 text-xs">
                    Segera
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
        <AddEntryDialog
          addTransactionSheetData={addTransactionSheetData}
          trigger={<Button className="w-full">+ Tambah</Button>}
        />
      </div>
    </nav>
  );
}
