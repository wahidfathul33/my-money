'use client';

/**
 * Create/edit sheet — one component for BOTH scopes (mirrors
 * `upsertBudgetAction` handling both via `scope` in the FormData). Category
 * is only pickable at CREATE time; editing locks it (amount + "Ulangi
 * setiap bulan" only), same "type locked on edit" shape as
 * src/features/wallets/components/wallet-form-sheet.tsx.
 */
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { deserializeMoney } from '@/lib/finance/money';
import { upsertBudgetAction, type ActionState } from '../actions';
import type { HouseholdBudgetClientData, PersonalBudgetClientData } from '../client-types';
import type { BudgetableCategory, BudgetableCategoryKey } from '../queries';
import { DeleteBudgetDialog } from './delete-budget-dialog';

const initialState: ActionState = { error: null };

type BudgetSheetProps =
  | {
      scope: 'personal';
      open: boolean;
      onOpenChange: (open: boolean) => void;
      period: string;
      /** Present => edit mode. Absent => create mode. */
      budget?: PersonalBudgetClientData;
      /** Create-mode only: expense categories not yet budgeted this period. */
      budgetableCategories: BudgetableCategory[];
    }
  | {
      scope: 'household';
      open: boolean;
      onOpenChange: (open: boolean) => void;
      period: string;
      householdId: string;
      budget?: HouseholdBudgetClientData;
      /** Create-mode only: catalog keys not yet budgeted this period. */
      budgetableCategoryKeys: BudgetableCategoryKey[];
    };

function SubmitButton({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} disabled={disabled} className="w-full">
      {label}
    </Button>
  );
}

/** Minor units -> a whole-rupiah string suitable for `Input type="money"` /
 * `fromRupiah` — budgets are always whole rupiah amounts in this UI. */
function toAmountInputValue(amount: string): string {
  return String(deserializeMoney(amount) / 100n);
}

export function BudgetSheet(props: BudgetSheetProps) {
  const { open, onOpenChange, period, budget } = props;
  const isEdit = Boolean(budget);
  const [state, formAction, isPending] = useActionState(upsertBudgetAction, initialState);

  const [amount, setAmount] = useState(() => (budget ? toAmountInputValue(budget.amount) : ''));
  const [isRecurring, setIsRecurring] = useState(budget?.isRecurring ?? true);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedCategoryKey, setSelectedCategoryKey] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  // Reset local state whenever the sheet opens fresh — same "adjust state
  // during render" pattern as wallet-form-sheet.tsx (avoids an extra Effect
  // render pass).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setAmount(budget ? toAmountInputValue(budget.amount) : '');
      setIsRecurring(budget?.isRecurring ?? true);
      setSelectedCategoryId('');
      setSelectedCategoryKey('');
    }
  }

  const noBudgetableCategories =
    !isEdit &&
    (props.scope === 'personal' ? props.budgetableCategories.length === 0 : props.budgetableCategoryKeys.length === 0);

  // Narrowed per-branch (not derived from the top-level `budget` alias) so
  // TypeScript can tie it to the matching client-data shape without a cast.
  const categoryLabel = props.scope === 'personal' ? props.budget?.categoryName : props.budget?.categoryLabel;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent variant="bottom" title={isEdit ? 'Ubah budget' : 'Tambah budget'}>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="scope" value={props.scope} />
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="isRecurring" value={String(isRecurring)} />
          {props.scope === 'household' && <input type="hidden" name="householdId" value={props.householdId} />}

          {props.scope === 'personal' ? (
            props.budget ? (
              <>
                <input type="hidden" name="categoryId" value={props.budget.categoryId} />
                <div className="flex flex-col gap-1.5">
                  <span className="text-text text-sm font-medium">Kategori</span>
                  <p className="text-text-muted text-sm">{props.budget.categoryName}</p>
                </div>
              </>
            ) : (
              <>
                <input type="hidden" name="categoryId" value={selectedCategoryId} />
                <Select
                  label="Kategori"
                  placeholder="Pilih kategori"
                  value={selectedCategoryId}
                  onValueChange={setSelectedCategoryId}
                  options={props.budgetableCategories.map((c) => ({ value: c.id, label: c.name }))}
                />
              </>
            )
          ) : props.budget ? (
            <>
              <input type="hidden" name="categoryKey" value={props.budget.categoryKey} />
              <div className="flex flex-col gap-1.5">
                <span className="text-text text-sm font-medium">Kategori</span>
                <p className="text-text-muted text-sm">{props.budget.categoryLabel}</p>
              </div>
            </>
          ) : (
            <>
              <input type="hidden" name="categoryKey" value={selectedCategoryKey} />
              <Select
                label="Kategori"
                placeholder="Pilih kategori"
                value={selectedCategoryKey}
                onValueChange={setSelectedCategoryKey}
                options={props.budgetableCategoryKeys.map((c) => ({ value: c.key, label: c.name }))}
              />
            </>
          )}

          {noBudgetableCategories ? (
            <p className="text-text-muted text-sm">
              Semua kategori pengeluaran sudah punya budget periode ini.
            </p>
          ) : (
            <>
              <Input
                label="Nominal (Rp)"
                name="amount"
                type="money"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />

              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-text text-sm font-medium">Ulangi setiap bulan</span>
                  <span className="text-text-muted text-xs">Budget baru dibuat otomatis tiap tanggal 1</span>
                </div>
                <Switch label="Ulangi setiap bulan" checked={isRecurring} onCheckedChange={setIsRecurring} />
              </div>
            </>
          )}

          {state.error && (
            <p role="alert" className="text-negative text-sm">
              {state.error}
            </p>
          )}

          <SubmitButton
            label={isEdit ? 'Simpan perubahan' : 'Tambah budget'}
            disabled={noBudgetableCategories}
          />

          {budget && (
            <Button type="button" variant="ghost" className="text-negative" onClick={() => setDeleteOpen(true)}>
              Hapus budget
            </Button>
          )}
        </form>
      </SheetContent>

      {budget && (
        <DeleteBudgetDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          budgetId={budget.id}
          categoryLabel={categoryLabel ?? ''}
          householdId={props.scope === 'household' ? props.householdId : undefined}
          onDeleted={() => onOpenChange(false)}
        />
      )}
    </Sheet>
  );
}
