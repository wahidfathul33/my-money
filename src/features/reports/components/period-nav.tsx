import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { shiftPeriod } from '@/lib/date/timezone';
import { formatPeriodLabel } from '../period-label';

/**
 * `‹ September 2026 ›` for `/reports` — plain `Link`s (not a client
 * component with local state) so each navigation is a normal RSC request
 * that re-runs every query for the new period server-side, same data-flow
 * shape as `src/app/(app)/wealth/net-worth/page.tsx`'s range chips.
 */
export function PeriodNav({ period }: { period: string }) {
  const prev = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);

  return (
    <div
      className="rounded-card border-border bg-surface flex items-center justify-between border px-1"
      role="group"
      aria-label="Pilih periode"
    >
      <Link
        href={`/reports?period=${prev}`}
        aria-label="Bulan sebelumnya"
        className="pressable flex size-11 shrink-0 items-center justify-center"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </Link>
      <span className="text-text flex-1 text-center text-sm font-medium">{formatPeriodLabel(period)}</span>
      <Link
        href={`/reports?period=${next}`}
        aria-label="Bulan berikutnya"
        className="pressable flex size-11 shrink-0 items-center justify-center"
      >
        <ChevronRight className="size-5" aria-hidden="true" />
      </Link>
    </div>
  );
}
