'use client';

/**
 * `/settings/data`'s CSV export button — docs/12-security-and-auth.md §11:
 * "Ekspor: CSV seluruh transaksi, dompet, aset, hutang milik user." The
 * actual query/formatting/rate-limit logic lives in
 * src/features/settings/export.ts (task 21's `exportDataAction` — see that
 * file's own header for why it's a placeholder on THIS branch); this
 * component only triggers the download once it succeeds.
 */
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { exportDataAction } from '../export';

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

export function ExportDataButton() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await exportDataAction();
      if (result.error || !result.csv) {
        setError(result.error ?? 'Ekspor gagal. Coba lagi.');
        return;
      }
      downloadCsv(result.csv, result.filename ?? 'mymoney-export.csv');
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
