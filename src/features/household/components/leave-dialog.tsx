'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/sheet';
import { RadioGroup } from '@/components/ui/radio-group';
import { leaveHouseholdAction } from '../members';
import { OK, type ActionState } from '../action-state';

function LeaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" className="flex-1" loading={pending}>
      Keluar
    </Button>
  );
}

interface LeaveDialogProps {
  householdId: string;
  householdName: string;
  /** docs/10-ux-states.md §5.3: "42 transaksi Anda ditandai ke keluarga
   * ini" — the count the tag-fate choice is made against. */
  taggedTransactionCount: number;
}

/**
 * docs/10-ux-states.md §5.3's exact mock: consequences as bullets, then the
 * tag-fate radio ("Biarkan di laporan keluarga" default / "Lepaskan dari
 * laporan"), then Batal/Keluar. If the caller turns out to be the household's
 * sole owner, `leaveHousehold` (src/lib/services/memberships.ts) rejects with
 * `LastOwnerError` — surfaced here as an inline message rather than a crash,
 * pointing at the real fix (alih kepemilikan dulu) instead of a dead end.
 */
export function LeaveDialog({ householdId, householdName, taggedTransactionCount }: LeaveDialogProps) {
  const [open, setOpen] = useState(false);
  const [tagChoice, setTagChoice] = useState<'keep' | 'release'>('keep');
  const [state, formAction] = useActionState<ActionState, FormData>(leaveHouseholdAction, OK);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">Keluar dari keluarga</Button>
      </DialogTrigger>
      <DialogContent variant="center" title={`Keluar dari ${householdName}?`}>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="tagChoice" value={tagChoice} />

          <ul className="text-text-muted flex flex-col gap-1.5 text-sm">
            <li>Data keuangan Anda tetap milik Anda dan tidak hilang.</li>
            <li>Berbagi dompet dan aset dicabut seketika.</li>
            <li>Anda tidak lagi melihat laporan keluarga ini.</li>
          </ul>

          {taggedTransactionCount > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-text text-sm font-medium">
                {taggedTransactionCount} transaksi Anda ditandai ke keluarga ini:
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

          {state.error && (
            <p role="alert" className="text-negative text-sm">
              {state.error}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <LeaveButton />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
