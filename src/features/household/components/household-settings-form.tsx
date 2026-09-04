'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { updateHouseholdAction, type ActionState } from '../actions';
import { TIMEZONE_OPTIONS } from '../timezone-options';
import { ArchiveHouseholdDialog } from './archive-household-dialog';

const initialState: ActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      Simpan perubahan
    </Button>
  );
}

interface HouseholdSettingsFormProps {
  householdId: string;
  name: string;
  timezone: string;
  /** Only `owner` may rename/change timezone/archive — docs/03 §4.2. */
  isOwner: boolean;
  memberCount: number;
}

export function HouseholdSettingsForm({
  householdId,
  name,
  timezone,
  isOwner,
  memberCount,
}: HouseholdSettingsFormProps) {
  const toast = useToast();
  const [state, formAction, isPending] = useActionState(updateHouseholdAction, initialState);
  const [selectedTimezone, setSelectedTimezone] = useState(timezone);

  const wasPending = useRef(isPending);
  useEffect(() => {
    if (wasPending.current && !isPending && state.error === null) {
      toast.show({ title: 'Tersimpan', variant: 'success' });
    }
    wasPending.current = isPending;
  }, [isPending, state.error, toast]);

  if (!isOwner) {
    return (
      <Card className="flex flex-col gap-4">
        <p className="text-text-muted text-sm">
          Hanya pemilik keluarga yang dapat mengubah nama dan zona waktu.
        </p>
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-text-muted">Nama</dt>
            <dd className="text-text font-medium">{name}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-text-muted">Zona waktu</dt>
            <dd className="text-text font-medium">{timezone}</dd>
          </div>
        </dl>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="timezone" value={selectedTimezone} />

          <Input label="Nama keluarga" name="name" defaultValue={name} required maxLength={60} />
          <Select
            label="Zona waktu"
            options={TIMEZONE_OPTIONS}
            value={selectedTimezone}
            onValueChange={setSelectedTimezone}
          />

          {state.error && (
            <p role="alert" className="text-negative text-sm">
              {state.error}
            </p>
          )}

          <SubmitButton />
        </form>
      </Card>

      <Card variant="flat" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-text font-medium">Arsipkan keluarga</p>
          <p className="text-text-muted text-sm">
            Menyembunyikan keluarga ini dari daftar dan switcher. Data setiap anggota tetap ada.
          </p>
        </div>
        <ArchiveHouseholdDialog
          householdId={householdId}
          householdName={name}
          memberCount={memberCount}
        />
      </Card>
    </div>
  );
}
