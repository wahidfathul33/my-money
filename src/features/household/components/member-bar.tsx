/**
 * `MemberBar` — docs/07-design-system.md §14.3's catalog entry: "Baris
 * 'siapa membayar apa' dengan proporsi". Each member's segment is filled
 * relative to the TOP spender (that row = 100%), not relative to the
 * household total — a "leaderboard" bar, so a household with many members
 * doesn't collapse every bar into a sliver. Color comes from
 * `avatarHueFor` (src/features/household/components/member-avatar.tsx) —
 * the SAME hash `<MemberAvatar>` itself uses, per docs §14.4's "dipakai
 * konsisten di avatar, bar ..., dan rincian kontribusi".
 *
 * Server-safe: plain `<div>`s, no Radix — `Progress`
 * (src/components/ui/progress.tsx) can't take an arbitrary per-member
 * color (only a class), and this doesn't need Radix's ARIA value machinery
 * beyond a plain `role="img"` + `aria-label` (a per-member spend amount
 * isn't a task-progress value).
 */
import { MoneyText } from '@/components/finance/money-text';
import { formatIDR } from '@/lib/finance/money';
import type { Money } from '@/lib/finance/money';
import { avatarHueFor } from './member-avatar';

export interface MemberBarItem {
  userId: string;
  name: string;
  total: Money;
}

interface MemberBarRowProps {
  item: MemberBarItem;
  maxAmount: Money;
}

function MemberBarRow({ item, maxAmount }: MemberBarRowProps) {
  const hue = avatarHueFor(item.userId);
  const pct = maxAmount > 0n ? Number((item.total * 100n) / maxAmount) : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="text-text w-20 shrink-0 truncate text-sm font-medium">{item.name}</span>
      <div
        role="img"
        aria-label={`${item.name}: ${formatIDR(item.total)}`}
        className="bg-surface-raised h-2 flex-1 overflow-hidden rounded-full"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: `oklch(62% 0.12 ${hue})` }}
        />
      </div>
      <MoneyText amount={item.total} tone="plain" size="sm" className="w-24 shrink-0 text-right" />
    </div>
  );
}

interface MemberBarProps {
  items: MemberBarItem[];
  className?: string;
}

export function MemberBar({ items, className }: MemberBarProps) {
  if (items.length === 0) return null;
  const maxAmount = items.reduce((max, item) => (item.total > max ? item.total : max), 0n);

  return (
    <div className={className}>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <MemberBarRow key={item.userId} item={item} maxAmount={maxAmount} />
        ))}
      </div>
    </div>
  );
}
