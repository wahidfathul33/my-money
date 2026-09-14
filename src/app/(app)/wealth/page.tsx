import Link from 'next/link';
import { Gem, HandCoins, Target } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { MoneyText } from '@/components/finance/money-text';
import { requireUser } from '@/lib/auth/require-user';
import { getTotalSavings, listGoals } from '@/features/savings/queries';
import { getTotalDebt, getTotalReceivable } from '@/features/obligations/queries';
import { getUserPreferences } from '@/features/settings/queries';

// Hub kekayaan — tumbuh per task. Task 15 (savings-goals) menambah kartu
// "Tabungan"; task 18 (debts-receivables) menambah kartu "Hutang & Piutang"
// di bawah ini. Net worth penuh dan aset (emas/deposito) menyusul di
// task-task berikutnya (docs/02-IA §5). Setiap kartu berdiri sendiri dan
// tidak saling bergantung, supaya task lain yang juga menambah entry point
// di halaman ini bisa menambah kartunya sendiri tanpa menyentuh baris ini.
export default async function WealthPage() {
  const user = await requireUser();
  const [goals, totalSaved, totalDebt, totalReceivable, preferences] = await Promise.all([
    listGoals(user.id),
    getTotalSavings(user.id),
    getTotalDebt(user.id),
    getTotalReceivable(user.id),
    getUserPreferences(user.id),
  ]);
  const hasSavings = goals.length > 0;
  const hasObligations = totalDebt > 0n || totalReceivable > 0n;

  return (
    <>
      <PageHeader title="Kekayaan" />
      <div className="px-page-x flex flex-col gap-6 pb-8">
        <Link href="/wealth/savings" className="pressable-tint bg-surface rounded-card flex items-center gap-3 p-4">
          <span className="bg-brand-subtle text-brand-readable flex size-11 shrink-0 items-center justify-center rounded-full">
            <Target className="size-5" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-text text-body font-medium">Tabungan</span>
            <span className="text-text-muted text-sm">
              {hasSavings ? `${goals.length} target aktif` : 'Belum ada target'}
            </span>
          </span>
          <MoneyText amount={totalSaved} tone="plain" size="md" />
        </Link>

        <Link href="/wealth/debts" className="pressable-tint bg-surface rounded-card flex items-center gap-3 p-4">
          <span className="bg-negative-subtle text-negative flex size-11 shrink-0 items-center justify-center rounded-full">
            <HandCoins className="size-5" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-text text-body font-medium">Hutang & Piutang</span>
            {/* docs/09-screen-specs.md §4: piutang selalu ditampilkan
                terpisah, berlabel apakah ia dihitung dalam kekayaan bersih
                — ADR-010's setting decides which label applies. */}
            {totalReceivable > 0n && (
              <span className="text-text-muted text-sm">
                Piutang <MoneyText amount={totalReceivable} tone="plain" size="sm" />{' '}
                {preferences.countReceivablesAsAsset ? '(termasuk)' : '(tidak dihitung)'}
              </span>
            )}
          </span>
          <MoneyText amount={totalDebt} tone="plain" size="md" />
        </Link>

        {!hasSavings && !hasObligations && (
          <EmptyState
            icon={Gem}
            title="Belum ada data kekayaan"
            description="Tambahkan dompet, emas, atau deposito untuk mulai melihat kekayaan bersih Anda."
          />
        )}
      </div>
    </>
  );
}
