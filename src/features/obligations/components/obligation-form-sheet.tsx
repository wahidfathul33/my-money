'use client';

/**
 * Create/edit sheet for ONE debt or receivable — `kind` picks the action
 * pair, the name field, and the id field, same "one component, a scope
 * discriminator" shape as src/features/budgets/components/budget-sheet.tsx.
 *
 * `startDate`/`affectsWallet`/`walletId` are CREATE-ONLY fields (see
 * src/features/obligations/schema.ts's doc comment on why the update
 * schemas omit `startDate`, and src/lib/services/obligations.ts's
 * `updateObligationCore` on why `affectsWallet`/`walletId` are locked) —
 * edit mode shows the start date as read-only context and doesn't show
 * `affectsWallet`/wallet at all.
 *
 * `initialAmount` stays editable in BOTH modes — the service enforces "only
 * before any payment exists" itself and surfaces a clear error if that's
 * violated, so this form doesn't need to know a debt's payment history just
 * to decide whether to render the field.
 */
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { WalletPicker } from '@/features/transactions/components/wallet-picker';
import { ExclusionToggle } from '@/features/sharing/components/exclusion-toggle';
import type { WalletOption } from '@/features/transactions/sheet-data';
import {
  createDebtAction,
  createReceivableAction,
  updateDebtAction,
  updateReceivableAction,
  type ActionState,
} from '../actions';
import type { ObligationListItemClientData } from '../client-types';
import type { CounterpartyCandidate } from '../queries';
import { WriteOffDialog } from './write-off-dialog';

const initialState: ActionState = { error: null };
const NONE = '';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full">
      {label}
    </Button>
  );
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ObligationFormSheetProps {
  kind: 'debt' | 'receivable';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present => edit mode. Absent => create mode. */
  obligation?: ObligationListItemClientData;
  counterpartyCandidates: CounterpartyCandidate[];
  wallets: WalletOption[];
  onWrittenOff?: () => void;
}

export function ObligationFormSheet({
  kind,
  open,
  onOpenChange,
  obligation,
  counterpartyCandidates,
  wallets,
  onWrittenOff,
}: ObligationFormSheetProps) {
  const isEdit = Boolean(obligation);
  const action =
    kind === 'debt'
      ? isEdit
        ? updateDebtAction
        : createDebtAction
      : isEdit
        ? updateReceivableAction
        : createReceivableAction;
  const [state, formAction, isPending] = useActionState(action, initialState);

  const [affectsWallet, setAffectsWallet] = useState(true);
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? '');
  const [counterpartyUserId, setCounterpartyUserId] = useState(obligation?.counterpartyUserId ?? NONE);
  const [writeOffOpen, setWriteOffOpen] = useState(false);

  // Close the sheet after a successful submit — same "was pending, no
  // longer pending, no error" transition src/features/wallets/components/
  // wallet-form-sheet.tsx uses.
  const wasPending = useRef(isPending);
  useEffect(() => {
    if (wasPending.current && !isPending && state.error === null) {
      onOpenChange(false);
    }
    wasPending.current = isPending;
  }, [isPending, state.error, onOpenChange]);

  // Reset local state whenever the sheet opens fresh — "adjust during
  // render, not in an Effect" (same technique as wallet-form-sheet.tsx /
  // goal-form-sheet.tsx).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setAffectsWallet(true);
      setWalletId(wallets[0]?.id ?? '');
      setCounterpartyUserId(obligation?.counterpartyUserId ?? NONE);
    }
  }

  const noun = kind === 'debt' ? 'Hutang' : 'Piutang';
  const nounLower = kind === 'debt' ? 'hutang' : 'piutang';
  const nameLabel = kind === 'debt' ? 'Nama pemberi pinjaman' : 'Nama peminjam';
  const nameField = kind === 'debt' ? 'creditorName' : 'debtorName';
  const idField = kind === 'debt' ? 'debtId' : 'receivableId';
  const title = isEdit ? `Ubah ${nounLower}` : `${noun} baru`;

  const counterpartyOptions = [
    { value: NONE, label: 'Tidak ada' },
    ...counterpartyCandidates.map((c) => ({ value: c.userId, label: c.name ?? c.email })),
  ];

  const showMissingCounterpartNote =
    isEdit && obligation!.counterpartyUserId !== null && !obligation!.counterpartRecordExists;

  const canWriteOff = isEdit && obligation!.status !== 'paid' && obligation!.status !== 'written_off';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          variant="bottom"
          title={title}
          description={
            !isEdit
              ? kind === 'debt'
                ? 'Matikan "Pengaruhi saldo dompet" bila Anda belum menerima uang tunai (mis. teman membelikan sesuatu untuk Anda).'
                : 'Matikan "Pengaruhi saldo dompet" bila Anda belum benar-benar menyerahkan uang tunai.'
              : undefined
          }
        >
          <form action={formAction} className="flex flex-col gap-4">
            {isEdit && <input type="hidden" name={idField} value={obligation!.id} />}

            <Input label={nameLabel} name={nameField} defaultValue={obligation?.name} required maxLength={120} />

            <Input
              label="Nominal (Rp)"
              name="initialAmount"
              type="money"
              defaultValue={obligation ? (BigInt(obligation.initialAmount) / 100n).toString() : ''}
              required
            />

            {isEdit ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-text text-sm font-medium">Tanggal mulai</span>
                <p className="text-text-muted text-sm">{obligation!.startDate}</p>
              </div>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="text-text text-sm font-medium">Tanggal mulai</span>
                <input
                  type="date"
                  name="startDate"
                  defaultValue={todayDateStr()}
                  required
                  className="rounded-input border-border bg-surface text-body text-text h-11 border px-3"
                />
              </label>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-text text-sm font-medium">Jatuh tempo (opsional)</span>
              <input
                type="date"
                name="dueDate"
                defaultValue={obligation?.dueDate ?? ''}
                className="rounded-input border-border bg-surface text-body text-text h-11 border px-3"
              />
            </label>

            {!isEdit && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-text text-sm font-medium">Pengaruhi saldo dompet</span>
                  <Switch label="Pengaruhi saldo dompet" checked={affectsWallet} onCheckedChange={setAffectsWallet} />
                </div>
                <input type="hidden" name="affectsWallet" value={String(affectsWallet)} />

                {affectsWallet && wallets.length > 0 && (
                  <>
                    <input type="hidden" name="walletId" value={walletId} />
                    <WalletPicker wallets={wallets} value={walletId} onChange={setWalletId} triggerLabel="Dompet" />
                  </>
                )}
              </>
            )}

            {counterpartyCandidates.length > 0 && (
              <>
                <input type="hidden" name="counterpartyUserId" value={counterpartyUserId} />
                <Select
                  label="Sesama anggota keluarga (opsional)"
                  options={counterpartyOptions}
                  value={counterpartyUserId}
                  onValueChange={setCounterpartyUserId}
                />
                {showMissingCounterpartNote && (
                  <p className="text-text-muted text-xs">
                    Pasangan catatan dari {obligation!.counterpartyName} belum ada.
                  </p>
                )}
              </>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-text text-sm font-medium">Catatan (opsional)</span>
              <textarea
                name="note"
                defaultValue={obligation?.note ?? ''}
                maxLength={280}
                rows={2}
                className="rounded-input border-border bg-surface text-body text-text border px-3 py-2"
              />
            </label>

            {state.error && (
              <p role="alert" className="text-negative text-sm">
                {state.error}
              </p>
            )}

            <SubmitButton label={isEdit ? 'Simpan perubahan' : `Buat ${nounLower}`} />

            {canWriteOff && (
              <Button type="button" variant="ghost" className="text-negative" onClick={() => setWriteOffOpen(true)}>
                Hapuskan {nounLower}
              </Button>
            )}
          </form>

          {isEdit && (
            <div className="border-border mt-4 border-t pt-4">
              <ExclusionToggle
                entityType={kind}
                entityId={obligation!.id}
                label={`${noun} ini`}
                excluded={obligation!.excludeFromHousehold}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {isEdit && (
        <WriteOffDialog
          open={writeOffOpen}
          onOpenChange={setWriteOffOpen}
          kind={kind}
          obligationId={obligation!.id}
          name={obligation!.name}
          onWrittenOff={() => {
            onOpenChange(false);
            onWrittenOff?.();
          }}
        />
      )}
    </>
  );
}
