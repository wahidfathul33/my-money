'use client';

/**
 * `/settings/data`'s CSV export button — docs/12-security-and-auth.md §11:
 * "Ekspor: CSV seluruh transaksi, dompet, aset, hutang milik user." The
 * actual query/formatting/rate-limit logic lives in
 * src/features/settings/export.ts (task 21's `exportDataAction`), which
 * returns one CSV string per table rather than a single combined file —
 * downloaded here as separate, clearly-named files in one user gesture.
 * `exportDataAction` throws (`ExportRateLimitedError` on the fail-closed
 * 3/hour limit, or whatever `requireUser()` throws) rather than returning
 * an `{error}` shape, unlike this file's sibling Server Actions in
 * src/features/settings/actions.ts — caught here directly.
 */
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { exportDataAction, type ExportResult } from '../export';

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const EXPORT_TABLES: { key: keyof Omit<ExportResult, 'generatedAt'>; filename: string }[] = [
  { key: 'transactions', filename: 'transaksi.csv' },
  { key: 'wallets', filename: 'dompet.csv' },
  { key: 'assets', filename: 'aset.csv' },
  { key: 'debts', filename: 'hutang.csv' },
  { key: 'receivables', filename: 'piutang.csv' },
];

export function ExportDataButton() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await exportDataAction();
        const dateStamp = result.generatedAt.slice(0, 10);
        for (const { key, filename } of EXPORT_TABLES) {
          downloadCsv(result[key], `mymoney-${dateStamp}-${filename}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ekspor gagal. Coba lagi.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" className="w-full" loading={isPending} onClick={handleClick}>
        Ekspor data (CSV)
      </Button>
      {error && (
        <p role="alert" className="text-negative text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
