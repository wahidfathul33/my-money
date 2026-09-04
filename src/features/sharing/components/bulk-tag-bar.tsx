'use client';

/**
 * The floating action bar for bulk-tagging old transactions —
 * tasks/12-sharing-and-privacy spec.md: "Penandaan massal transaksi lama
 * dengan konfirmasi jumlah", todo.md "Pilih beberapa → 'Tandai ke
 * keluarga'". Rendered by src/features/transactions/components/transaction-list.tsx
 * while that list is in select mode.
 *
 * Solid surface, not `material-glass` — docs/07's "max two glass elements
 * on screen" budget is already spent on the bottom nav + whatever sheet/
 * toast might be open; this is transient UI, not worth the budget.
 */
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { bulkTagTransactionsAction } from '../actions';
import type { HouseholdOption } from './household-toggle';

interface BulkTagBarProps {
  selectedIds: string[];
  households: HouseholdOption[];
  onCancel: () => void;
  onTagged: (taggedIds: string[], householdId: string) => void;
}

export function BulkTagBar({ selectedIds, households, onCancel, onTagged }: BulkTagBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmHousehold, setConfirmHousehold] = useState<HouseholdOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const count = selectedIds.length;

  function startTagging() {
    setError(null);
    if (households.length === 1) {
      setConfirmHousehold(households[0]!);
      return;
    }
    setPickerOpen(true);
  }

  function pickHousehold(household: HouseholdOption) {
    setPickerOpen(false);
    setConfirmHousehold(household);
  }

  function closeConfirm() {
    setConfirmHousehold(null);
    setError(null);
  }

  function confirm() {
    if (!confirmHousehold) return;
    setError(null);
    startTransition(async () => {
      const result = await bulkTagTransactionsAction(selectedIds, confirmHousehold.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      const household = confirmHousehold;
      setConfirmHousehold(null);
      onTagged(selectedIds, household.id);
    });
  }

  return (
    <>
      <div
        className={cn(
          'safe-bottom fixed inset-x-0 z-40 flex justify-center px-4',
          'bottom-[calc(var(--nav-height)+var(--safe-b)+0.75rem)] md:bottom-4',
        )}
      >
        <div className="bg-surface-raised shadow-float rounded-full flex items-center gap-2 px-2 py-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Batal
          </Button>
          <span className="text-text px-1 text-sm font-medium">{count} dipilih</span>
          <Button size="sm" disabled={count === 0} loading={isPending} onClick={startTagging}>
            Tandai ke keluarga
          </Button>
        </div>
      </div>

      {households.length > 1 && (
        <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
          <SheetContent title="Tandai ke keluarga mana?">
            <ul className="flex flex-col">
              {households.map((household) => (
                <li key={household.id}>
                  <button
                    type="button"
                    onClick={() => pickHousehold(household)}
                    className="pressable-tint rounded-inner text-text flex h-12 w-full items-center px-2 text-left text-sm"
                  >
                    {household.name}
                  </button>
                </li>
              ))}
            </ul>
          </SheetContent>
        </Sheet>
      )}

      <Dialog open={confirmHousehold !== null} onOpenChange={(next) => !next && closeConfirm()}>
        <DialogContent
          variant="center"
          title={confirmHousehold ? `Tandai ${count} transaksi ke ${confirmHousehold.name}?` : ''}
        >
          <div className="flex flex-col gap-4">
            <p className="text-text-muted text-sm">
              Nominal, kategori, tanggal, dan catatan {count} transaksi ini akan terlihat oleh anggota{' '}
              {confirmHousehold?.name}. Saldo dompet Anda tidak ikut terlihat.
            </p>

            {error && (
              <p role="alert" className="text-negative text-sm">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={closeConfirm}>
                Batal
              </Button>
              <Button type="button" className="flex-1" loading={isPending} onClick={confirm}>
                Tandai
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
