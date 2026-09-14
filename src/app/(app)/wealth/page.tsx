import Link from 'next/link';
import { Gem, Landmark, Target } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { MoneyText } from '@/components/finance/money-text';
import { requireUser } from '@/lib/auth/require-user';
import { getTotalSavings, listGoals } from '@/features/savings/queries';
import { getTotalDepositValue, listDeposits } from '@/features/assets/deposits/queries';

// Hub kekayaan — tumbuh per task. Task 15 (savings-goals) menambah kartu
// "Tabungan"; task 17 (assets-deposits) menambah kartu "Deposito" di
// bawahnya. Net worth penuh, emas, dan hutang menyusul di task-task
// berikutnya (docs/02-IA §5). Setiap kartu berdiri sendiri dan tidak saling
// bergantung, supaya task lain yang juga menambah entry point di halaman
// ini bisa menambah kartunya sendiri tanpa menyentuh baris punya task lain.
export default async function WealthPage() {
  const user = await requireUser();
  const [goals, totalSaved, deposits, totalDepositPrincipal] = await Promise.all([
    listGoals(user.id),
    getTotalSavings(user.id),
    listDeposits(user.id),
    getTotalDepositValue(user.id),
  ]);
  const hasSavings = goals.length > 0;
  const activeDepositCount = deposits.filter((d) => d.status === 'active').length;
  const hasDeposits = deposits.length > 0;

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

        <Link
          href="/wealth/assets/deposits"
          className="pressable-tint bg-surface rounded-card flex items-center gap-3 p-4"
        >
          <span className="bg-brand-subtle text-brand-readable flex size-11 shrink-0 items-center justify-center rounded-full">
            <Landmark className="size-5" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-text text-body font-medium">Deposito</span>
            <span className="text-text-muted text-sm">
              {hasDeposits ? `${activeDepositCount} deposito aktif` : 'Belum ada deposito'}
            </span>
          </span>
          <MoneyText amount={totalDepositPrincipal} tone="plain" size="md" />
        </Link>

        {!hasSavings && !hasDeposits && (
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
