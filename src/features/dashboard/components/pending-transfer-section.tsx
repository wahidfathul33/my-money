/**
 * "Transfer menunggu" — docs/09-screen-specs.md §1's aturan tampil table:
 * shown only when there's at least one unacknowledged incoming member
 * transfer (`/activity`, docs/09 §14). Kept deliberately small — a count +
 * up to 2 names, not a full activity feed — since the actual review flow
 * (Oke / Pindahkan / Hapus) lives on `/activity` itself, not here.
 */
import Link from 'next/link';
import { ArrowLeftRight } from 'lucide-react';
import { MoneyText } from '@/components/finance/money-text';
import type { ActivityItem } from '@/features/activity/queries';

interface PendingTransferSectionProps {
  count: number;
  preview: ActivityItem[];
}

export function PendingTransferSection({ count, preview }: PendingTransferSectionProps) {
  return (
    <Link
      href="/activity"
      className="pressable-tint bg-surface rounded-card flex items-center gap-3 p-4"
      aria-label={`Transfer menunggu ditinjau, ${count}`}
    >
      <span className="bg-brand-subtle text-brand-readable flex size-10 shrink-0 items-center justify-center rounded-full">
        <ArrowLeftRight className="size-4" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-text text-sm font-medium">
          {count} transfer menunggu ditinjau
        </span>
        {preview[0] && (
          <span className="text-text-muted truncate text-xs">
            {preview[0].senderName ?? preview[0].senderEmail} mencatat transfer masuk
          </span>
        )}
      </span>
      {preview[0] && <MoneyText amount={preview[0].amount} tone="plain" size="sm" />}
    </Link>
  );
}
