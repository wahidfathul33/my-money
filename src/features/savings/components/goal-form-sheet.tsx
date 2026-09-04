'use client';

/**
 * Create/edit sheet for a goal — name, target amount, optional target date,
 * and (create mode only) personal-vs-shared household picker. Icon/color
 * stay at their schema defaults (`target`/`emerald`) — spec.md's acceptance
 * criteria never call for customizing them, so this form doesn't grow a
 * picker for it, same restraint src/features/wallets/components/wallet-form-sheet.tsx
 * shows by leaving icon/color out of ITS create mode too.
 *
 * `householdId` is locked once a goal exists — like wallets locking `type`
 * after creation, moving a goal between personal and shared after the fact
 * isn't a rename, it's a different set of who-can-see-it/who-can-contribute
 * rules, and nothing in spec.md asks for it.
 */
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { createGoalAction, updateGoalAction, type ActionState } from '../actions';
import type { SavingsGoalDetailClientData } from '../client-types';

const initialState: ActionState = { error: null };
const PERSONAL_VALUE = '';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full">
      {label}
    </Button>
  );
}

interface GoalFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present => edit mode. Absent => create mode. */
  goal?: SavingsGoalDetailClientData;
  /** Households the caller may create a SHARED goal in — create mode only,
   * ignored when `lockedHouseholdId` is set. Omitted/empty means only
   * "Pribadi" is offered. */
  households?: { id: string; name: string }[];
  /** `/household/[id]/savings`'s create flow: always creates a SHARED goal
   * for THIS household specifically — no "Pribadi" escape hatch, no picker
   * at all, since offering "personal" from inside a household context page
   * would be confusing about which list the new goal lands in. */
  lockedHouseholdId?: string;
  onSuccess?: (goalId: string) => void;
}

export function GoalFormSheet({
  open,
  onOpenChange,
  goal,
  households = [],
  lockedHouseholdId,
  onSuccess,
}: GoalFormSheetProps) {
  const isEdit = Boolean(goal);
  const action = isEdit ? updateGoalAction : createGoalAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [householdId, setHouseholdId] = useState(goal?.householdId ?? lockedHouseholdId ?? PERSONAL_VALUE);

  const wasPending = useRef(isPending);
  useEffect(() => {
    if (wasPending.current && !isPending && state.error === null) {
      onOpenChange(false);
      if (state.goalId) onSuccess?.(state.goalId);
    }
    wasPending.current = isPending;
  }, [isPending, state.error, state.goalId, onOpenChange, onSuccess]);

  // Reset local state whenever the sheet opens fresh — same "adjust during
  // render, not in an Effect" pattern as wallet-form-sheet.tsx.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setHouseholdId(goal?.householdId ?? lockedHouseholdId ?? PERSONAL_VALUE);
  }

  const householdOptions = [
    { value: PERSONAL_VALUE, label: 'Pribadi' },
    ...households.map((h) => ({ value: h.id, label: h.name })),
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        variant="bottom"
        title={isEdit ? 'Ubah goal' : 'Goal tabungan baru'}
        description={
          isEdit
            ? undefined
            : 'Kontribusi ke goal ini selalu memindahkan uang dari dompet Anda — bukan sekadar catatan.'
        }
      >
        <form action={formAction} className="flex flex-col gap-4">
          {isEdit && <input type="hidden" name="goalId" value={goal!.id} />}

          <Input label="Nama goal" name="name" defaultValue={goal?.name} required maxLength={80} />

          <Input
            label="Target (Rp)"
            name="targetAmount"
            type="money"
            defaultValue={goal ? (BigInt(goal.targetAmount) / 100n).toString() : ''}
            required
          />

          <label className="flex flex-col gap-1.5">
            <span className="text-text text-sm font-medium">Tanggal target (opsional)</span>
            <input
              type="date"
              name="targetDate"
              defaultValue={goal?.targetDate ?? ''}
              className="rounded-input border-border bg-surface text-body text-text h-11 border px-3"
            />
          </label>

          {!isEdit && lockedHouseholdId && (
            <>
              <input type="hidden" name="householdId" value={lockedHouseholdId} />
              <p className="text-text-muted text-sm">
                Goal bersama — seluruh anggota aktif dapat melihat dan berkontribusi, masing-masing dari
                dompet mereka sendiri.
              </p>
            </>
          )}

          {!isEdit && !lockedHouseholdId && households.length > 0 && (
            <>
              <input type="hidden" name="householdId" value={householdId} />
              <Select
                label="Untuk"
                options={householdOptions}
                value={householdId}
                onValueChange={setHouseholdId}
              />
              {householdId !== PERSONAL_VALUE && (
                <p className="text-text-muted text-sm">
                  Goal bersama — seluruh anggota aktif dapat melihat dan berkontribusi, masing-masing dari
                  dompet mereka sendiri.
                </p>
              )}
            </>
          )}

          {state.error && (
            <p role="alert" className="text-negative text-sm">
              {state.error}
            </p>
          )}

          <SubmitButton label={isEdit ? 'Simpan perubahan' : 'Buat goal'} />
        </form>
      </SheetContent>
    </Sheet>
  );
}
