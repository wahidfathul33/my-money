import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The data table every report chart is paired with — spec.md: "Chart untuk
 * pola, angka untuk kepastian." Never optional decoration (todo.md: "Setiap
 * chart disertai `<DataTable>` di bawahnya") — a chart alone can't be
 * screen-read meaningfully and can't be copy-pasted into a spreadsheet; this
 * is what makes every number in a chart independently verifiable.
 *
 * Column count is deliberately kept to the caller's discretion but the
 * convention across this feature is 2-3 columns MAX (label, amount,
 * optional share%) — table semantics, not chart semantics, but still
 * subject to the same "no horizontal scroll at 360px" discipline
 * (AGENTS.md), so no report table in this app should ever need more
 * columns than that. `overflow-x-auto` below is a defensive fallback for a
 * future caller with more columns, not a license to rely on it.
 */
export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** Screen-reader-only summary of what this table restates — e.g. "Data
   * pengeluaran per kategori, September 2026". */
  caption: string;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  emptyMessage = 'Belum ada data.',
  className,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <p className="text-text-muted px-1 text-sm">{emptyMessage}</p>;
  }

  return (
    <div className={cn('rounded-card border-border overflow-x-auto border', className)}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-border border-b">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'text-text-muted px-3 py-2 text-xs font-medium whitespace-nowrap',
                  col.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-separator divide-y">
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'text-text px-3 py-2',
                    col.align === 'right' ? 'text-right tabular-nums' : 'text-left',
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
