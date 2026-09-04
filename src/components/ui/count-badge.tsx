import { cn } from '@/lib/utils';

interface CountBadgeProps {
  count: number;
  className?: string;
}

/**
 * Small numeric pill — tasks/13-transfers-member's unacknowledged-Activity
 * count on the context switcher and the "Lainnya" menu (todo.md: "Lencana
 * pada context switcher & menu Lainnya"). Renders nothing at `count <= 0` —
 * callers still need their OWN `aria-label` on the surrounding interactive
 * element mentioning the count (this span is `aria-hidden`, purely visual;
 * a screen reader gets the number from that label instead of a bare pill).
 */
export function CountBadge({ count, className }: CountBadgeProps) {
  if (count <= 0) return null;

  return (
    <span
      aria-hidden="true"
      className={cn(
        'fill-negative-solid text-on-brand inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
