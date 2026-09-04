import Link from 'next/link';
import { Gem, Target } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { MoneyText } from '@/components/finance/money-text';
import { requireUser } from '@/lib/auth/require-user';
import { getTotalSavings, listGoals } from '@/features/savings/queries';

// Hub kekayaan — tumbuh per task. Task 15 (savings-goals) menambah kartu
// "Tabungan" di bawah; net worth penuh, aset, dan hutang menyusul di
// task-task berikutnya (docs/02-IA §5). Setiap kartu berdiri sendiri dan
// tidak saling bergantung, supaya task lain yang juga menambah entry point
// di halaman ini (mis. task 14/anggaran) bisa menambah kartunya sendiri
// tanpa menyentuh baris ini.
export default async function WealthPage() {
  const user = await requireUser();
  const [goals, totalSaved] = await Promise.all([listGoals(user.id), getTotalSavings(user.id)]);
  const hasSavings = goals.length > 0;

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
              {hasSavings ? `${goals.length} goal aktif` : 'Belum ada goal'}
            </span>
          </span>
          <MoneyText amount={totalSaved} tone="plain" size="md" />
        </Link>

        {!hasSavings && (
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
