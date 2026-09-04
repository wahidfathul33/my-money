'use client';

import { Check, ChevronDown, Plus, User, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sheet, SheetClose, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { CountBadge } from '@/components/ui/count-badge';
import { cn } from '@/lib/utils';
import type { HouseholdSummary } from '../queries';

interface ContextSwitcherProps {
  households: HouseholdSummary[];
  /** `mobile` opens a bottom sheet (header trigger); `desktop` opens a
   * centered dialog (sidebar trigger) — same Sheet/Dialog primitive as
   * every other presentation-variant pair in this app (docs/02-IA §4,
   * src/components/layout/sidebar.tsx's `AddEntryDialog`). */
  variant: 'mobile' | 'desktop';
  /** tasks/13-transfers-member — unreviewed Activity count (todo.md:
   * "Lencana pada context switcher & menu Lainnya"). Defaults to 0 so
   * every other existing caller/test keeps working unchanged. */
  unacknowledgedCount?: number;
}

/**
 * docs/02-information-architecture.md §3 — plain URL navigation to `/` or
 * `/household/[id]`, no global state, current context always read back from
 * `usePathname()` rather than stored anywhere.
 *
 * **Hidden entirely when `households` is empty** — tasks/10-household-core
 * spec.md's hardest requirement: "Pengguna tanpa household tidak melihat
 * elemen household apa pun — switcher tersembunyi." Returning `null` here
 * (rather than the caller deciding not to render this component) keeps that
 * rule in exactly one place, no matter how many call sites this component
 * gets.
 */
export function ContextSwitcher({ households, variant, unacknowledgedCount = 0 }: ContextSwitcherProps) {
  const pathname = usePathname();
  if (households.length === 0) return null;

  const activeHouseholdId = pathname.match(/^\/household\/([^/]+)/)?.[1];
  const activeHousehold = households.find((h) => h.id === activeHouseholdId);
  const label = activeHousehold ? activeHousehold.name : 'Personal';

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={
            unacknowledgedCount > 0
              ? `${label}, ${unacknowledgedCount} aktivitas belum ditinjau`
              : undefined
          }
          className="pressable-tint rounded-inner border-border bg-surface text-text flex h-10 max-w-full items-center gap-2 border px-3 text-sm font-medium"
        >
          {activeHousehold ? (
            <Users className="text-text-muted size-4 shrink-0" aria-hidden="true" />
          ) : (
            <User className="text-text-muted size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{label}</span>
          <CountBadge count={unacknowledgedCount} />
          <ChevronDown className="text-text-muted size-4 shrink-0" aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent variant={variant === 'mobile' ? 'bottom' : 'center'} title="Ganti konteks">
        <ul className="flex flex-col gap-1">
          <li>
            <p className="text-text-subtle px-2 pt-2 pb-1 text-xs font-semibold tracking-wide uppercase">
              Pribadi
            </p>
            <SheetClose asChild>
              <Link
                href="/"
                aria-current={!activeHousehold ? 'page' : undefined}
                className="pressable-tint rounded-inner text-body text-text flex h-12 items-center gap-3 px-2"
              >
                <User className="text-text-muted size-5" aria-hidden="true" />
                Keuangan Saya
                {!activeHousehold && (
                  <Check className="text-brand ml-auto size-4" aria-hidden="true" />
                )}
              </Link>
            </SheetClose>
          </li>

          <li>
            <p className="text-text-subtle px-2 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase">
              Keluarga
            </p>
            <ul className="flex flex-col gap-1">
              {households.map((household) => {
                const isActive = household.id === activeHouseholdId;
                return (
                  <li key={household.id}>
                    <SheetClose asChild>
                      <Link
                        href={`/household/${household.id}`}
                        aria-current={isActive ? 'page' : undefined}
                        className="pressable-tint rounded-inner text-body text-text flex h-12 items-center gap-3 px-2"
                      >
                        <Users className="text-text-muted size-5" aria-hidden="true" />
                        <span className="truncate">{household.name}</span>
                        <span
                          className={cn(
                            'text-text-muted ml-auto text-xs',
                            isActive && 'mr-1',
                          )}
                        >
                          {household.memberCount} org
                        </span>
                        {isActive && <Check className="text-brand size-4" aria-hidden="true" />}
                      </Link>
                    </SheetClose>
                  </li>
                );
              })}
            </ul>
          </li>

          <li className="border-border mt-1 border-t pt-1">
            <SheetClose asChild>
              <Link
                href="/household/new"
                className="pressable-tint rounded-inner text-body text-brand-readable flex h-12 items-center gap-3 px-2 font-medium"
              >
                <Plus className="size-5" aria-hidden="true" />
                Buat keluarga baru
              </Link>
            </SheetClose>
          </li>
        </ul>
      </SheetContent>
    </Sheet>
  );
}
