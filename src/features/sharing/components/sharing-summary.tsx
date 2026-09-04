/**
 * Per-household card for `/settings/sharing` — docs/09-screen-specs.md
 * §17's mockup: `share_wealth` status + tagged-transaction count in one
 * card per household. No `'use client'` of its own (a plain Server
 * Component wrapper); `ShareWealthToggle` (the only interactive piece)
 * already carries the directive.
 */
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { ShareWealthToggle } from './share-wealth-toggle';
import type { SharingSummaryHousehold } from '../queries';

interface SharingSummaryCardProps {
  household: SharingSummaryHousehold;
}

export function SharingSummaryCard({ household }: SharingSummaryCardProps) {
  return (
    <Card variant="flat" className="flex flex-col gap-4">
      <p className="text-heading text-text font-semibold">{household.householdName}</p>

      <ShareWealthToggle
        householdId={household.householdId}
        householdName={household.householdName}
        shareWealth={household.shareWealth}
      />

      <div className="border-border flex items-center justify-between border-t pt-3">
        <p className="text-text-muted text-sm">
          {household.taggedTransactionCount} transaksi bertanda keluarga
        </p>
        <Link
          href={`/household/${household.householdId}/transactions`}
          className="text-brand-readable text-sm font-medium"
        >
          Lihat semua
        </Link>
      </div>
    </Card>
  );
}
