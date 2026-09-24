'use client';

/**
 * `/settings/recurring` — tasks/24-recurring-transactions/spec.md: "daftar
 * gabungan (transaksi rutin + kontribusi rutin, beri badge/ikon pembeda),
 * tiap baris: nama/kategori, nominal, frekuensi, jadwal berikutnya, status,
 * aksi jeda/lanjutkan/hapus." One combined, sorted list — active rules
 * first (soonest `next_run_date` first), then paused, then ended — same
 * ordering `listRecurringTransactions`/`listRecurringContributions`
 * (src/features/recurring/queries.ts) already apply server-side per kind;
 * this component just interleaves the two kinds by that same key.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownCircle, ArrowUpCircle, PiggyBank, Repeat } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent } from '@/components/ui/sheet';
import { MoneyText } from '@/components/finance/money-text';
import { Icon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { deserializeMoney } from '@/lib/finance/money';
import { categoryColorClasses } from '@/features/categories/category-colors';
import type { RecurringFrequency } from '@/lib/date/recurring';
import {
  deleteRecurringContributionAction,
  deleteRecurringTransactionAction,
  pauseRecurringContributionAction,
  pauseRecurringTransactionAction,
  resumeRecurringContributionAction,
  resumeRecurringTransactionAction,
} from '../actions';
import type { RecurringContributionClientData, RecurringTransactionClientData } from '../client-types';

const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  daily: 'Harian',
  weekly: 'Mingguan',
  monthly: 'Bulanan',
};

const STATUS_LABEL: Record<'active' | 'paused' | 'ended', string> = {
  active: 'Aktif',
  paused: 'Dijeda',
  ended: 'Berakhir',
};

interface CombinedRow {
  key: string;
  kind: 'transaction' | 'contribution';
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  colorClasses: { bg: string; text: string };
  amount: string;
  /** `MoneyText`'s `tone` prop — `row.amount` is always a POSITIVE minor-unit
   * figure (same "sign lives on the ledger, never the stored amount"
   * convention transactions.amount itself follows), so this is derived from
   * `type`/`kind`, never from `amount`'s own sign (auto` would get it wrong
   * for an expense row). */
  amountTone: 'positive' | 'negative' | 'plain';
  transactionType: 'income' | 'expense' | null;
  frequency: RecurringFrequency;
  nextRunDate: string;
  status: 'active' | 'paused' | 'ended';
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(y, m - 1, d),
  );
}

function toCombinedRows(
  transactions: RecurringTransactionClientData[],
  contributions: RecurringContributionClientData[],
): CombinedRow[] {
  const txRows: CombinedRow[] = transactions.map((t) => ({
    key: `transaction:${t.id}`,
    kind: 'transaction',
    id: t.id,
    title: t.categoryName,
    subtitle: `${t.type === 'income' ? 'Pemasukan' : 'Pengeluaran'} · ${t.walletName}`,
    icon: t.categoryIcon,
    colorClasses: categoryColorClasses(t.categoryColor),
    amount: t.amount,
    amountTone: t.type === 'income' ? 'positive' : 'negative',
    transactionType: t.type,
    frequency: t.frequency,
    nextRunDate: t.nextRunDate,
    status: t.status,
  }));

  const contribRows: CombinedRow[] = contributions.map((c) => ({
    key: `contribution:${c.id}`,
    kind: 'contribution',
    id: c.id,
    title: c.goalName,
    subtitle: `Tabungan · ${c.walletName}`,
    icon: c.goalIcon,
    colorClasses: categoryColorClasses(c.goalColor),
    amount: c.amount,
    amountTone: 'plain',
    transactionType: null,
    frequency: c.frequency,
    nextRunDate: c.nextRunDate,
    status: c.status,
  }));

  const STATUS_ORDER: Record<'active' | 'paused' | 'ended', number> = { active: 0, paused: 1, ended: 2 };
  return [...txRows, ...contribRows].sort((a, b) => {
    if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    return a.nextRunDate < b.nextRunDate ? -1 : a.nextRunDate > b.nextRunDate ? 1 : 0;
  });
}

interface RecurringListProps {
  transactions: RecurringTransactionClientData[];
  contributions: RecurringContributionClientData[];
}

export function RecurringList({ transactions, contributions }: RecurringListProps) {
  const rows = toCombinedRows(transactions, contributions);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Repeat}
        title="Belum ada transaksi rutin"
        description='Aktifkan "Ulangi transaksi ini" saat mencatat, atau "Kontribusi otomatis" di halaman target tabungan.'
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <RecurringRow key={row.key} row={row} />
      ))}
    </div>
  );
}

function RecurringRow({ row }: { row: CombinedRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function handlePauseResume() {
    setError(null);
    startTransition(async () => {
      const action =
        row.status === 'active'
          ? row.kind === 'transaction'
            ? pauseRecurringTransactionAction
            : pauseRecurringContributionAction
          : row.kind === 'transaction'
            ? resumeRecurringTransactionAction
            : resumeRecurringContributionAction;
      const result = await action(row.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const action = row.kind === 'transaction' ? deleteRecurringTransactionAction : deleteRecurringContributionAction;
      const result = await action(row.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
    });
  }

  const amount = deserializeMoney(row.amount);
  const KindIcon =
    row.kind === 'transaction' ? (row.transactionType === 'income' ? ArrowUpCircle : ArrowDownCircle) : PiggyBank;

  return (
    <Card>
      <div className="flex items-center gap-3">
        <span
          className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', row.colorClasses.bg, row.colorClasses.text)}
        >
          <Icon name={row.icon} className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <KindIcon className="text-text-subtle size-3.5 shrink-0" aria-hidden="true" />
            <span className="text-text truncate text-sm font-medium">{row.title}</span>
          </div>
          <span className="text-text-muted text-xs">{row.subtitle}</span>
        </div>
        <MoneyText amount={amount} tone={row.amountTone} size="sm" />
      </div>

      <div className="text-text-muted flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs">
        <span>{FREQUENCY_LABEL[row.frequency]}</span>
        <span>
          {row.status === 'ended' ? 'Berakhir' : 'Berikutnya'}: {formatDateLabel(row.nextRunDate)}
        </span>
        <span
          className={cn(
            'rounded-chip px-2 py-0.5 font-medium',
            row.status === 'active' && 'bg-positive-subtle text-positive-readable',
            row.status === 'paused' && 'bg-surface-raised text-text-muted',
            row.status === 'ended' && 'bg-surface-raised text-text-subtle',
          )}
        >
          {STATUS_LABEL[row.status]}
        </span>
      </div>

      {error && (
        <p role="alert" className="text-negative pt-2 text-xs">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-3">
        {row.status !== 'ended' && (
          <Button variant="secondary" size="sm" loading={isPending} onClick={handlePauseResume}>
            {row.status === 'active' ? 'Jeda' : 'Lanjutkan'}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
          Hapus
        </Button>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent variant="center" title={`Hapus ${row.title}?`}>
          <div className="flex flex-col gap-4">
            <p className="text-text-muted text-sm">
              Aturan rutin ini akan dihapus. {row.kind === 'transaction' ? 'Transaksi' : 'Kontribusi'} yang sudah
              tercatat sebelumnya tidak terpengaruh.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteOpen(false)} disabled={isPending}>
                Batal
              </Button>
              <Button variant="danger" className="flex-1" loading={isPending} onClick={handleDelete}>
                Hapus
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
