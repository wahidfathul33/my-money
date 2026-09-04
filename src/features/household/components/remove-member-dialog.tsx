'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/sheet';
import { RadioGroup } from '@/components/ui/radio-group';
import { useToast } from '@/components/ui/toast';
import { removeMemberAction } from '../members';
import { OK } from '../action-state';

interface RemoveMemberDialogProps {
  householdId: string;
  memberUserId: string;
  memberName: string;
  taggedTransactionCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * docs/08-copywriting.md §5.8: "Keluarkan anggota dari keluarga?" —
 * specialized here with the member's name, matching §5.2's "judul menyebut
 * objek spesifiknya" for every other destructive dialog in this app
 * (ArchiveHouseholdDialog names the household, not "this household").
 * Owner-triggered only (src/features/household/components/owner-menu.tsx)
 * — `removeMember` (src/lib/services/memberships.ts) re-verifies that
 * server-side regardless of what this component chooses to render.
 *
 * Calls `removeMemberAction` directly inside `useTransition` — NOT
 * `useActionState` + a `<form action>` + a "pending flipped to false"
 * effect. A successful removal makes the target's row disappear from the
 * NEXT render of the members list (`listActiveMembers` no longer returns
 * them), which unmounts THIS dialog at essentially the same moment
 * `useActionState`'s pending flag would flip back to `false`. Confirmed via
 * a real e2e run: the "pending -> false" render and the row's removal
 * landed in the same React commit, so the effect watching for that
 * transition never actually fired — the toast silently never appeared, and
 * only console tracing (`{isPending: true, wasPending: false}` with no
 * follow-up `false` log) revealed why. Handling the result inline, in the
 * same async callback that made the call, isn't subject to that race — see
 * src/features/household/components/archive-household-dialog.tsx (task 10)
 * for the same pattern applied to the same class of problem.
 */
export function RemoveMemberDialog({
  householdId,
  memberUserId,
  memberName,
  taggedTransactionCount,
  open,
  onOpenChange,
}: RemoveMemberDialogProps) {
  const [tagChoice, setTagChoice] = useState<'keep' | 'release'>('keep');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function handleConfirm() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('householdId', householdId);
      formData.set('userId', memberUserId);
      formData.set('tagChoice', tagChoice);
      const result = await removeMemberAction(OK, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      toast.show({ title: `${memberName} dikeluarkan`, variant: 'success' });
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setError(null);
      }}
    >
      <DialogContent variant="center" title={`Keluarkan ${memberName} dari keluarga?`}>
        <div className="flex flex-col gap-4">
          <ul className="text-text-muted flex flex-col gap-1.5 text-sm">
            <li>{memberName} kehilangan akses ke keluarga ini seketika.</li>
            <li>Berbagi dompet dan asetnya dicabut otomatis.</li>
            <li>Data keuangannya sendiri tidak terhapus.</li>
          </ul>

          {taggedTransactionCount > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-text text-sm font-medium">
                {taggedTransactionCount} transaksi {memberName} ditandai ke keluarga ini:
              </p>
              <RadioGroup
                label="Nasib transaksi yang ditandai"
                value={tagChoice}
                onValueChange={(value) => setTagChoice(value as 'keep' | 'release')}
                options={[
                  { value: 'keep', label: 'Biarkan di laporan keluarga' },
                  { value: 'release', label: 'Lepaskan dari laporan' },
                ]}
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-negative text-sm">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button variant="danger" className="flex-1" loading={isPending} onClick={handleConfirm}>
              Keluarkan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
