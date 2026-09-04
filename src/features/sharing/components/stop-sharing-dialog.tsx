'use client';

/**
 * "Berhenti berbagi semuanya" — spec.md: flips `share_wealth` OFF across
 * EVERY household in one action, WITH confirmation stating the number
 * affected (docs/10-ux-states.md §5.1's row for this action — unlike a
 * single household's toggle, which needs confirmation only to turn ON,
 * this bulk action needs it in BOTH directions because it's the one place
 * sharing can be revoked for households the caller isn't even looking at
 * right now).
 *
 * spec.md is explicit this app never offers the opposite ("share
 * everything") button anywhere — this dialog exists precisely because
 * revoking is meant to be easy and discoverable, not because symmetry with
 * a "share all" action is expected.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/sheet';
import { stopSharingEverythingAction } from '../actions';

interface StopSharingDialogProps {
  /** Households CURRENTLY sharing — the number the confirmation states. */
  sharingCount: number;
}

export function StopSharingDialog({ sharingCount }: StopSharingDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (sharingCount === 0) return null; // Nothing to stop — spec.md's default-private state.

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await stopSharingEverythingAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="danger" className="w-full" onClick={() => setOpen(true)}>
        Berhenti berbagi semuanya
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent variant="center" title="Berhenti berbagi semuanya?">
          <div className="flex flex-col gap-4">
            <p className="text-text-muted text-sm">
              Kekayaan Anda berhenti terlihat di {sharingCount} keluarga tempat Anda saat ini
              membagikannya. Transaksi yang sudah ditandai ke keluarga tidak berubah.
            </p>

            {error && (
              <p role="alert" className="text-negative text-sm">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Batal
              </Button>
              <Button variant="danger" className="flex-1" loading={isPending} onClick={handleConfirm}>
                Berhenti berbagi
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
