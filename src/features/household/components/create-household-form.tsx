'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { createHouseholdAction, type ActionState } from '../actions';
import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS } from '../timezone-options';

const initialState: ActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full">
      Buat Keluarga
    </Button>
  );
}

/**
 * `/household/new` — tasks/10-household-core/spec.md: the creator becomes
 * the sole `owner` automatically (no role picker here; there's no one else
 * to invite yet — task 11). On success `createHouseholdAction` redirects
 * straight into `/household/[id]`.
 */
export function CreateHouseholdForm() {
  const [state, formAction] = useActionState(createHouseholdAction, initialState);
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);

  return (
    <Card className="max-w-md">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="timezone" value={timezone} />
        <Input
          label="Nama keluarga"
          name="name"
          placeholder="Keluarga Wahid"
          required
          maxLength={60}
          autoFocus
        />
        <Select
          label="Zona waktu"
          options={TIMEZONE_OPTIONS}
          value={timezone}
          onValueChange={setTimezone}
        />

        {state.error && (
          <p role="alert" className="text-negative text-sm">
            {state.error}
          </p>
        )}

        <SubmitButton />
      </form>
    </Card>
  );
}
