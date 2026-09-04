'use client';

/**
 * One Activity item — docs/09-screen-specs.md §14. Two densities of the
 * SAME data, sharing the SAME three actions:
 *   - `<UnreviewedActivityCard>` — the full card (sender, amount, wallet,
 *     date, household, and all three buttons inline) for "Belum ditinjau".
 *   - `<PreviousActivityRow>` — the compact one-line form for "Sebelumnya"
 *     (already acknowledged — no "Oke" to offer), Pindahkan/Hapus tucked
 *     behind a `⋮` menu, same pattern as
 *     src/features/household/components/owner-menu.tsx.
 *
 * "Saldo sudah berubah sebelum halaman ini dibuka" (spec.md) — none of
 * these three actions asks for confirmation before applying (docs/10-ux-states.md
 * §5.1: acknowledging is reversible-by-nature, moving is an ordinary edit,
 * and deleting gets the same "apply + 5s undo toast" as every other
 * transaction delete in this app, NOT a dialog).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownLeft, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { MoneyText } from '@/components/finance/money-text';
import { voidTransferAction, unvoidTransferAction } from '@/features/transfers/actions';
import { acknowledgeTransactionAction } from '../actions';
import { activityItemAmount, type ActivityClientItem } from '../client-types';
import type { OwnWalletOption } from '../queries';
import { MoveWalletSheet } from './move-wallet-sheet';

const LONG_DATE_FORMAT = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });

function senderLabel(item: ActivityClientItem): string {
  return item.senderName ?? item.senderEmail;
}

function useActivityActions(item: ActivityClientItem) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  function acknowledge() {
    startTransition(async () => {
      const result = await acknowledgeTransactionAction(item.id);
      if (result.error) return;
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await voidTransferAction(item.id);
      if (result.error) return;
      router.refresh();
      toast.show({
        title: 'Dihapus dari Aktivitas',
        variant: 'success',
        action: {
          label: 'Urungkan',
          onClick: () => {
            startTransition(async () => {
              await unvoidTransferAction(item.id);
              router.refresh();
            });
          },
        },
      });
    });
  }

  return { isPending, acknowledge, remove };
}

interface UnreviewedActivityCardProps {
  item: ActivityClientItem;
  ownWallets: OwnWalletOption[];
}

export function UnreviewedActivityCard({ item, ownWallets }: UnreviewedActivityCardProps) {
  const { isPending, acknowledge, remove } = useActivityActions(item);

  return (
    <li className="border-border rounded-card bg-surface flex flex-col gap-3 border p-4">
      <div className="flex items-start gap-3">
        <span className="bg-brand-subtle text-brand-readable flex size-10 shrink-0 items-center justify-center rounded-full">
          <ArrowDownLeft className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-text truncate text-sm font-medium">{senderLabel(item)} mencatat</p>
          <p className="text-text-muted truncate text-sm">
            Transfer masuk{item.wallet ? ` ke ${item.wallet.name}` : ''}
          </p>
          <p className="text-text-muted mt-1 truncate text-xs">
            {LONG_DATE_FORMAT.format(item.transactionDate)}
            {item.householdName ? ` · ${item.householdName}` : ''}
          </p>
        </div>
        <MoneyText amount={activityItemAmount(item)} tone="positive" showSign size="md" />
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" loading={isPending} onClick={acknowledge}>
          Oke
        </Button>
        <MoveWalletSheet
          transactionId={item.id}
          currentWalletId={item.wallet?.id ?? null}
          wallets={ownWallets}
          trigger={
            <Button variant="secondary" size="sm" className="flex-1" disabled={isPending}>
              Pindahkan
            </Button>
          }
        />
        <Button variant="ghost" size="sm" className="text-negative flex-1" loading={isPending} onClick={remove}>
          Hapus
        </Button>
      </div>
    </li>
  );
}

interface PreviousActivityRowProps {
  item: ActivityClientItem;
  ownWallets: OwnWalletOption[];
}

export function PreviousActivityRow({ item, ownWallets }: PreviousActivityRowProps) {
  const { isPending, remove } = useActivityActions(item);
  // Two SEPARATE sheets, deliberately never open at once — the "aksi" list
  // closes itself the instant either choice is picked, THEN the chosen
  // sheet/action runs. Same discipline as
  // src/features/household/components/owner-menu.tsx's own doc comment
  // (two simultaneously-open Radix Dialog Roots is the bug to avoid).
  const [actionsOpen, setActionsOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  return (
    <li className="flex items-center gap-3 px-2 py-2.5">
      <span className="bg-surface-raised text-text-muted flex size-8 shrink-0 items-center justify-center rounded-full">
        <ArrowDownLeft className="size-4" aria-hidden="true" />
      </span>
      <p className="text-text-muted min-w-0 flex-1 truncate text-sm">
        {senderLabel(item)} · {LONG_DATE_FORMAT.format(item.transactionDate)}
      </p>
      <MoneyText amount={activityItemAmount(item)} tone="positive" showSign size="sm" />

      <Sheet open={actionsOpen} onOpenChange={setActionsOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Aksi untuk transfer dari ${senderLabel(item)}`}
            disabled={isPending}
          >
            <MoreVertical className="size-4" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent title={`Aksi untuk transfer dari ${senderLabel(item)}`} hideTitle>
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => {
                setActionsOpen(false);
                setMoveOpen(true);
              }}
            >
              Pindahkan ke dompet lain
            </Button>
            <Button
              variant="ghost"
              className="text-negative justify-start"
              onClick={() => {
                setActionsOpen(false);
                remove();
              }}
            >
              Hapus
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <MoveWalletSheet
        transactionId={item.id}
        currentWalletId={item.wallet?.id ?? null}
        wallets={ownWallets}
        open={moveOpen}
        onOpenChange={setMoveOpen}
      />
    </li>
  );
}
