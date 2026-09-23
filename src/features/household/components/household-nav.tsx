'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getHouseholdMenuItems } from '../household-menu-items';

interface HouseholdNavProps {
  householdId: string;
  name: string;
}

/**
 * Mobile/tablet sub-nav for `/household/[id]/**` — rendered by
 * src/app/(app)/household/[householdId]/layout.tsx, so every page under it
 * gets this for free. Desktop doesn't need it: the sidebar itself swaps to
 * the same item set instead (src/components/layout/sidebar.tsx) since
 * there's persistent nav chrome to swap there — mobile has none, only the
 * bottom nav (which stays the personal one), so this fills that gap.
 *
 * docs/02-IA §7: "Back dari `/household/[id]/...` menuju `/household/[id]`,
 * lalu ke `/`." — the household name here links nowhere special; getting
 * back to `/` is the context switcher's job (rendered above this, in
 * AppShell's mobile header), not this component's.
 */
export function HouseholdNav({ householdId, name }: HouseholdNavProps) {
  const pathname = usePathname();
  const items = getHouseholdMenuItems(householdId);

  return (
    <div className="border-border border-b md:hidden">
      <p className="text-heading text-text px-page-x truncate pt-4 pb-2 font-semibold">{name}</p>
      <nav aria-label={`Navigasi ${name}`} className="px-page-x flex gap-1 overflow-x-auto pb-2">
        {items.map((item) => {
          const active = item.href
            ? item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`)
            : false;

          return item.href ? (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-chip shrink-0 px-3 py-1.5 text-sm font-medium whitespace-nowrap',
                active ? 'bg-brand-subtle text-brand-readable' : 'text-text-muted',
              )}
            >
              {item.label}
            </Link>
          ) : (
            <span
              key={item.label}
              className="rounded-chip text-text-muted shrink-0 px-3 py-1.5 text-sm whitespace-nowrap opacity-60"
            >
              {item.label}
            </span>
          );
        })}
      </nav>
    </div>
  );
}
