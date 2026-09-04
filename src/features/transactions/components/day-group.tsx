/**
 * One day's header (date + subtotal) and its transaction rows — docs/09 §3
 * "Header hari menampilkan tanggal + subtotal (income − expense; transfer
 * dikecualikan)". The subtotal itself is never computed here: `total` is
 * `dayTotals[date]` straight from the server (route handler /
 * `getDayTotals`, src/features/transactions/history-queries.ts) — this
 * component only formats and displays it (spec.md "Batasan: Jangan ...
 * menjumlahkan subtotal di klien").
 *
 * No `'use client'` of its own — presentational, and `<TransactionRow>`
 * (its only interactive child) already carries the directive.
 */
import { MoneyText } from '@/components/finance/money-text';
import type { TransactionHistoryClientItem } from '../history-client-types';
import { TransactionRow } from './transaction-row';

const DAY_LABEL_FORMAT = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** `YYYY-MM-DD` → "Hari ini" / "Kemarin" / "2 September" — `today`/`yesterday` are WIB calendar dates (`toLocalDate(new Date(), ...)`), computed once by the caller so every group in the list compares against the same "now". */
export function formatDayLabel(date: string, today: string, yesterday: string): string {
  if (date === today) return 'Hari ini';
  if (date === yesterday) return 'Kemarin';
  const [y, m, d] = date.split('-').map(Number);
  return DAY_LABEL_FORMAT.format(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)));
}

export interface DayTotal {
  income: bigint;
  expense: bigint;
}

interface TransactionDayGroupProps {
  date: string;
  today: string;
  yesterday: string;
  items: TransactionHistoryClientItem[];
  total: DayTotal | undefined;
  onOpenDetail: (item: TransactionHistoryClientItem) => void;
  onQuickDelete: (item: TransactionHistoryClientItem) => void;
  /** Bulk-tagging select mode — tasks/12-sharing-and-privacy. All default
   * to inert values so every existing caller renders exactly as before. */
  selectMode?: boolean;
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (item: TransactionHistoryClientItem) => void;
}

export function TransactionDayGroup({
  date,
  today,
  yesterday,
  items,
  total,
  onOpenDetail,
  onQuickDelete,
  selectMode = false,
  selectedIds,
  onToggleSelect,
}: TransactionDayGroupProps) {
  const net = (total?.income ?? 0n) - (total?.expense ?? 0n);

  return (
    <section>
      <div className="bg-surface-raised px-page-x flex items-baseline justify-between py-2">
        <h2 className="text-text-muted text-sm font-medium">{formatDayLabel(date, today, yesterday)}</h2>
        <MoneyText amount={net} tone="auto" showSign size="sm" />
      </div>
      <ul className="divide-border flex flex-col divide-y">
        {items.map((item) => (
          <li key={item.id} data-testid="transaction-row">
            <TransactionRow
              transaction={item}
              onOpenDetail={() => onOpenDetail(item)}
              onQuickDelete={() => onQuickDelete(item)}
              selectMode={selectMode}
              selected={selectedIds?.has(item.id) ?? false}
              onToggleSelect={() => onToggleSelect?.(item)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
