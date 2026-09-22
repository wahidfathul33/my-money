import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { shiftPeriod } from '@/lib/date/timezone';
import { formatPeriodLabel } from '../period-label';

/** Same idea as `./period-nav.tsx` (personal `/reports`), pointed at
 * `/household/[id]/reports` instead. */
export function HouseholdPeriodNav({ householdId, period }: { householdId: string; period: string }) {
  const prev = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);
  const base = `/household/${householdId}/reports`;

  return (
    <div
      className="rounded-card border-border bg-surface flex items-center justify-between border px-1"
      role="group"
      aria-label="Pilih periode"
    >
      <Link
        href={`${base}?period=${prev}`}
        aria-label="Bulan sebelumnya"
        className="pressable flex size-11 shrink-0 items-center justify-center"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </Link>
      <span className="text-text flex-1 text-center text-sm font-medium">{formatPeriodLabel(period)}</span>
      <Link
        href={`${base}?period=${next}`}
        aria-label="Bulan berikutnya"
        className="pressable flex size-11 shrink-0 items-center justify-center"
      >
        <ChevronRight className="size-5" aria-hidden="true" />
      </Link>
    </div>
  );
}
