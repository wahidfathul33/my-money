'use client';

/**
 * `/wealth/savings/[id]` interactive shell — big ring, contribute/withdraw/
 * edit/archive actions, contribution history, and (shared goals only) the
 * per-member breakdown. One component serves BOTH access paths (personal
 * `/wealth/savings/[id]` and reached-via-household) since
 * src/features/savings/queries.ts's `getGoal` already scopes what the
 * caller may see — there's nothing left for this component to branch on
 * except "is this goal shared", which it reads off `goal.householdId`.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PartyPopper, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/sheet';
import { ProgressRing } from '@/components/ui/progress';
import { MoneyText } from '@/components/finance/money-text';
import { Icon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { deserializeMoney } from '@/lib/finance/money';
import { calculateGoalProgress, suggestedMonthlyPerMember } from '@/lib/finance/savings';
import { categoryColorClasses } from '@/features/categories/category-colors';
import type { WalletOption } from '@/features/transactions/sheet-data';
import { archiveGoalAction } from '../actions';
import type {
  ContributionHistoryItemClientData,
  MemberContributionTotalClientData,
  SavingsGoalDetailClientData,
} from '../client-types';
import { ContributeSheet } from './contribute-sheet';
import { WithdrawSheet } from './withdraw-sheet';
import { GoalFormSheet } from './goal-form-sheet';
import { ContributionHistory } from './contribution-history';
import { MemberContributions } from './member-contributions';

interface GoalDetailClientProps {
  goal: SavingsGoalDetailClientData;
  contributions: ContributionHistoryItemClientData[];
  memberTotals: MemberContributionTotalClientData[];
  wallets: WalletOption[];
  defaultWalletId: string | null;
  ownFundedAmount: string;
}

export function GoalDetailClient({
  goal,
  contributions,
  memberTotals,
  wallets,
  defaultWalletId,
  ownFundedAmount,
}: GoalDetailClientProps) {
  const router = useRouter();
  const [contributeOpen, setContributeOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [isArchiving, startArchive] = useTransition();

  const isShared = goal.householdId !== null;
  const targetAmount = deserializeMoney(goal.targetAmount);
  const currentAmount = deserializeMoney(goal.currentAmount);
  const progress = calculateGoalProgress({ targetAmount, currentAmount, targetDate: goal.targetDate });
  const colors = categoryColorClasses(goal.color);
  const perMemberSuggestion =
    isShared && progress.suggestedMonthly !== null && goal.activeMemberCount
      ? suggestedMonthlyPerMember(progress.suggestedMonthly, goal.activeMemberCount)
      : null;

  function handleArchive() {
    setArchiveError(null);
    startArchive(async () => {
      const result = await archiveGoalAction(goal.id);
      if (result.error) {
        setArchiveError(result.error);
        return;
      }
      setArchiveConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="px-page-x flex flex-col gap-6 pb-8">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <span
          className={cn('flex size-14 items-center justify-center rounded-full', colors.bg, colors.text)}
        >
          <Icon name={goal.icon} className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-title text-text font-semibold">{goal.name}</h2>
          {isShared && goal.householdName && <p className="text-text-muted text-sm">{goal.householdName}</p>}
        </div>

        <ProgressRing
          value={progress.progressPct}
          size={140}
          label={`Progress ${goal.name}: ${Math.round(progress.progressPct)} persen`}
        />

        <div className="flex items-baseline gap-2">
          <MoneyText amount={currentAmount} tone="plain" size="lg" />
          <span className="text-text-muted text-sm">/ {`Rp${(targetAmount / 100n).toLocaleString('id-ID')}`}</span>
        </div>

        {goal.status === 'completed' && (
          <p className="text-positive-readable text-sm font-medium">Target tercapai</p>
        )}
        {progress.isOverdue && <p className="text-negative text-sm font-medium">Target terlewat</p>}
        {!progress.isOverdue && goal.status === 'active' && progress.remainingAmount > 0n && (
          <p className="text-text-muted text-sm">
            Sisa <MoneyText amount={progress.remainingAmount} tone="plain" size="sm" /> lagi
          </p>
        )}
        {goal.status === 'active' && !progress.isOverdue && progress.suggestedMonthly !== null && (
          <p className="text-text-muted text-xs">
            Saran per bulan: Rp{(progress.suggestedMonthly / 100n).toLocaleString('id-ID')}
            {isShared && perMemberSuggestion !== null && (
              <> (Rp{(perMemberSuggestion / 100n).toLocaleString('id-ID')} / anggota)</>
            )}
          </p>
        )}
      </div>

      {goal.status !== 'archived' && (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setContributeOpen(true)}>
            Kontribusi
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setWithdrawOpen(true)}>
            Tarik
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        {goal.status !== 'archived' && (
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" aria-hidden="true" />
            Ubah
          </Button>
        )}
        {goal.status !== 'archived' && (
          <Button variant="ghost" size="sm" onClick={() => setArchiveConfirmOpen(true)}>
            Arsipkan
          </Button>
        )}
      </div>

      {isShared && (
        <MemberContributions members={memberTotals} currentAmount={goal.currentAmount} targetAmount={goal.targetAmount} />
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-text text-sm font-semibold">Riwayat</h3>
        <ContributionHistory items={contributions} showContributorName={isShared} />
      </section>

      <ContributeSheet
        open={contributeOpen}
        onOpenChange={setContributeOpen}
        goalId={goal.id}
        goalName={goal.name}
        goalHouseholdId={goal.householdId}
        targetAmount={goal.targetAmount}
        currentAmount={goal.currentAmount}
        wasCompleted={progress.isCompleted}
        wallets={wallets}
        defaultWalletId={defaultWalletId}
        onCompleted={() => setCelebrationOpen(true)}
      />

      <WithdrawSheet
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        goalId={goal.id}
        goalName={goal.name}
        goalHouseholdId={goal.householdId}
        available={ownFundedAmount}
        wallets={wallets}
        defaultWalletId={defaultWalletId}
      />

      <GoalFormSheet open={editOpen} onOpenChange={setEditOpen} goal={goal} />

      <Dialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <DialogContent variant="center" title={`Arsipkan ${goal.name}?`}>
          <div className="flex flex-col gap-4">
            <p className="text-text-muted text-sm">
              Goal ini disembunyikan dari daftar aktif. Kontribusi yang sudah ada tidak dihapus — dana
              tetap aset Anda sampai ditarik.
            </p>
            {archiveError && (
              <p role="alert" className="text-negative text-sm">
                {archiveError}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setArchiveConfirmOpen(false)}>
                Batal
              </Button>
              <Button variant="danger" className="flex-1" loading={isArchiving} onClick={handleArchive}>
                Arsipkan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* One-time celebration when a contribution crosses the target — "sheet
          sederhana, tanpa konfeti" (todo.md). Fires from ContributeSheet's
          onCompleted, never from merely viewing an already-completed goal.
          The title bar IS the heading (no `hideTitle` + duplicate visible
          heading below it — matches every other Dialog in this codebase,
          e.g. ArchiveHouseholdDialog) so there's exactly one element with
          this text, not two. */}
      <Dialog open={celebrationOpen} onOpenChange={setCelebrationOpen}>
        <DialogContent variant="center" title="Target tercapai!">
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <PartyPopper className="text-brand size-10" aria-hidden="true" />
            <p className="text-text-muted text-sm">
              {goal.name} sudah mencapai Rp{(targetAmount / 100n).toLocaleString('id-ID')}.
            </p>
            <Button className="w-full" onClick={() => setCelebrationOpen(false)}>
              Selesai
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
