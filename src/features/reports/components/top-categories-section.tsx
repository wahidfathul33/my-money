import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { MoneyText } from '@/components/finance/money-text';
import { cn } from '@/lib/utils';
import type { TopCategoryComparison } from '../queries';

/** docs/09-screen-specs.md §9 §3: "Kategori terbesar — 3 teratas dengan
 * perbandingan terhadap bulan lalu." A ranked list, not a chart — three
 * numbers with a direction each read faster as text than as a bar. */
export function TopCategoriesSection({ items }: { items: TopCategoryComparison[] }) {
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-text text-sm font-semibold">Kategori Terbesar</h2>
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <Card key={item.categoryId} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-text-subtle w-4 shrink-0 text-xs font-semibold">{index + 1}</span>
              <span className="text-text truncate text-sm">{item.name}</span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <MoneyText amount={item.amount} tone="plain" size="sm" />
              <ChangeIndicator changePercent={item.changePercent} />
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function ChangeIndicator({ changePercent }: { changePercent: number | null }) {
  if (changePercent === null) {
    return <span className="text-text-muted text-xs">Baru bulan ini</span>;
  }
  if (changePercent === 0) {
    return <span className="text-text-muted text-xs">Sama seperti bulan lalu</span>;
  }

  const isIncrease = changePercent > 0;
  const Icon = isIncrease ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs', isIncrease ? 'text-negative' : 'text-positive-readable')}
    >
      <Icon className="size-3" aria-hidden="true" />
      {Math.abs(changePercent).toFixed(0)}% vs bulan lalu
    </span>
  );
}
