'use client';

/**
 * `/wealth/assets/deposits/[id]` — full terms, the running estimate
 * (clearly labeled, ADR-013), the ARO badge + link back to the deposit it
 * was rolled from (todo.md), the `exclude_from_household` toggle (reusing
 * task 12's shared `<ExclusionToggle>` with `entityType: 'asset'` — see
 * actions.ts's file header for why this feature has no toggle action of
 * its own), and the edit/withdraw entry points.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Landmark } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MoneyText } from '@/components/finance/money-text';
import { ExclusionToggle } from '@/features/sharing/components/exclusion-toggle';
import { accruedInterest, currentValue, daysRemaining } from '@/lib/finance/deposit';
import type { WalletOption } from '@/features/transactions/sheet-data';
import { toDepositSnapshot, type DepositDetailClientData } from '../client-types';
import { daysRemainingLabel, formatDateIndo, formatRatePercent, interestEstimateLabel } from '../display';
import { DepositFormSheet } from './deposit-form-sheet';
import { WithdrawDepositDialog } from './withdraw-deposit-dialog';

const SCHEDULE_LABEL: Record<'at_maturity' | 'monthly', string> = {
  at_maturity: 'Saat jatuh tempo',
  monthly: 'Bulanan',
};

const STATUS_LABEL: Record<'active' | 'matured' | 'withdrawn', string> = {
  active: 'Aktif',
  matured: 'Jatuh tempo',
  withdrawn: 'Sudah dicairkan',
};

interface DepositDetailClientProps {
  deposit: DepositDetailClientData;
  wallets: WalletOption[];
}

export function DepositDetailClient({ deposit, wallets }: DepositDetailClientProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const snapshot = toDepositSnapshot(deposit);
  const now = new Date();
  const remaining = daysRemaining(snapshot, now);
  const estimate = accruedInterest(snapshot, now);
  const canEdit = deposit.status === 'active';
  const canWithdraw = deposit.status === 'active' || deposit.status === 'matured';

  return (
    <div className="px-page-x flex flex-col gap-4 pb-8">
      <Card variant="raised" className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="bg-brand-subtle text-brand-readable flex size-11 shrink-0 items-center justify-center rounded-full">
            <Landmark className="size-5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-text truncate text-title font-semibold">{deposit.bankName}</span>
            <span className="text-text-muted text-sm">{STATUS_LABEL[deposit.status]}</span>
          </div>
          {deposit.rolledFromId && (
            <span className="bg-surface-raised text-text-subtle shrink-0 rounded-full px-2 py-0.5 text-xs">ARO</span>
          )}
        </div>

        <dl className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <dt className="text-text-muted text-sm">Pokok</dt>
            <dd>
              <MoneyText amount={currentValue(snapshot)} tone="plain" size="sm" />
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-text-muted text-sm">Suku bunga</dt>
            <dd className="text-text text-sm font-medium">{formatRatePercent(deposit.interestRateAnnual)}% / tahun</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-text-muted text-sm">Tanggal mulai</dt>
            <dd className="text-text text-sm font-medium">{formatDateIndo(deposit.startDate)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-text-muted text-sm">Jatuh tempo</dt>
            <dd className="text-text text-sm font-medium">
              {formatDateIndo(deposit.maturityDate)}
              {deposit.status === 'active' && <span className="text-text-muted"> · {daysRemainingLabel(remaining)}</span>}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-text-muted text-sm">Jadwal bunga</dt>
            <dd className="text-text text-sm font-medium">{SCHEDULE_LABEL[deposit.payoutSchedule]}</dd>
          </div>
          {deposit.aroEnabled && (
            <div className="flex items-center justify-between">
              <dt className="text-text-muted text-sm">Perpanjang otomatis</dt>
              <dd className="text-text text-sm font-medium">
                {deposit.aroIncludeInterest ? 'Ya, termasuk bunga' : 'Ya, pokok saja'}
              </dd>
            </div>
          )}
        </dl>

        <div className="border-border flex items-center justify-between border-t pt-3">
          <span className="text-text-muted text-sm">Estimasi bunga bersih</span>
          <div className="flex flex-col items-end">
            <MoneyText amount={estimate} tone="neutral" size="md" />
            <span className="text-text-subtle text-xs">{interestEstimateLabel(deposit.taxRate)}</span>
          </div>
        </div>

        {deposit.rolledFromId && deposit.rolledFromBankName && (
          <Link
            href={`/wealth/assets/deposits/${deposit.rolledFromId}`}
            className="pressable-tint text-brand-readable text-sm underline-offset-2 hover:underline"
          >
            Diperpanjang dari deposito {deposit.rolledFromBankName} sebelumnya →
          </Link>
        )}
      </Card>

      {(canEdit || canWithdraw) && (
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="secondary" onClick={() => setEditOpen(true)} className="flex-1">
              Ubah
            </Button>
          )}
          {canWithdraw && (
            <Button onClick={() => setWithdrawOpen(true)} className="flex-1">
              Cairkan
            </Button>
          )}
        </div>
      )}

      <Card className="flex flex-col gap-1">
        <ExclusionToggle entityType="asset" entityId={deposit.assetId} label="Deposito ini" excluded={deposit.excludeFromHousehold} />
      </Card>

      <DepositFormSheet open={editOpen} onOpenChange={setEditOpen} deposit={deposit} wallets={wallets} />
      <WithdrawDepositDialog open={withdrawOpen} onOpenChange={setWithdrawOpen} deposit={deposit} wallets={wallets} />
    </div>
  );
}
