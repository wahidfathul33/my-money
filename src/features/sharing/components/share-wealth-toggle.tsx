'use client';

/**
 * `household_members.share_wealth` — mechanism #2, docs/03-domain-model.md
 * §5.1's single per-membership switch. The asymmetry spec.md is explicit
 * about: turning ON requires a confirmation dialog stating exactly what
 * will and won't become visible (docs/10-ux-states.md §5.1's copy, with one
 * word changed — "kecualikan" → "sembunyikan" — to match
 * docs/08-copywriting.md §3.2's binding glossary, which supersedes other
 * docs' illustrative copy); turning OFF applies immediately, no dialog —
 * "penarikan akses tidak boleh punya friksi".
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/sheet';
import { setShareWealthAction } from '../actions';

interface ShareWealthToggleProps {
  householdId: string;
  householdName: string;
  shareWealth: boolean;
}

export function ShareWealthToggle({ householdId, householdName, shareWealth }: ShareWealthToggleProps) {
  const router = useRouter();
  const [value, setValue] = useState(shareWealth);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function apply(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setShareWealthAction(householdId, next);
      if (result.error) {
        setValue(!next); // roll back the optimistic flip
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleCheckedChange(next: boolean) {
    if (!next) {
      // Turning OFF — frictionless, no dialog (docs/10 §5.1).
      setValue(false);
      apply(false);
      return;
    }
    // Turning ON — the switch stays visually off until confirmed; the
    // dialog is the only path that can flip it (docs/10 §5.1's dialog).
    setConfirmOpen(true);
  }

  function confirmShare() {
    setValue(true);
    setConfirmOpen(false);
    apply(true);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-text text-sm font-medium">Kekayaan saya</span>
          <span className="text-text-muted text-xs">
            Aset, dompet, dan hutang saya dihitung di kekayaan keluarga.
          </span>
        </div>
        <Switch
          label={`Bagikan kekayaan ke ${householdName}`}
          checked={value}
          disabled={isPending}
          onCheckedChange={handleCheckedChange}
        />
      </div>
      {error && (
        <p role="alert" className="text-negative text-xs">
          {error}
        </p>
      )}

      {/* docs/10-ux-states.md §5.1's exact copy — the "TIDAK akan melihat"
          section matters as much as the first (see that doc's own note). */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent variant="center" title={`Bagikan kekayaan Anda ke ${householdName}?`}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-text text-sm font-medium">Anggota keluarga akan melihat:</p>
              <ul className="text-text-muted list-disc pl-5 text-sm">
                <li>Total aset dan liabilitas Anda, dan rinciannya per jenis (kas, emas, deposito)</li>
              </ul>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-text text-sm font-medium">Mereka TIDAK akan melihat:</p>
              <ul className="text-text-muted list-disc pl-5 text-sm">
                <li>Transaksi Anda</li>
                <li>Isi rekening per dompet</li>
                <li>Apa pun yang Anda sembunyikan</li>
              </ul>
            </div>
            <p className="text-text-muted text-sm">Anda dapat mematikannya kapan saja, dan efeknya seketika.</p>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setConfirmOpen(false)}
              >
                Batal
              </Button>
              <Button type="button" className="flex-1" loading={isPending} onClick={confirmShare}>
                Bagikan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
