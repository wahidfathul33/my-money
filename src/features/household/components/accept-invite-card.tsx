'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { acceptInvitationAction } from '../invitations';
import { OK, type ActionState } from '../action-state';

function AcceptButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full">
      Terima Undangan
    </Button>
  );
}

interface AcceptInviteCardProps {
  token: string;
  householdName: string;
  inviterName: string;
}

/**
 * `/invite/[token]`'s signed-in branch. Carries spec.md's mandatory,
 * verbatim acceptance-criterion sentence: *"Bergabung tidak membagikan data
 * keuangan Anda."* — this is the whole point of task 11's "Termasuk" /
 * "Tidak termasuk" split: joining changes nothing about what's visible to
 * anyone until the new member deliberately tags a transaction or flips
 * `share_wealth` (task 12).
 *
 * Every failure this can show is `acceptInvitation`'s ONE uniform message
 * (src/lib/services/invitations.ts) — expired, already used, or a
 * verified-email mismatch all render identically here, by design.
 */
export function AcceptInviteCard({ token, householdName, inviterName }: AcceptInviteCardProps) {
  const [state, formAction] = useActionState<ActionState, FormData>(acceptInvitationAction, OK);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-title text-text font-semibold">Undangan ke {householdName}</h1>
        <p className="text-text-muted text-sm">{inviterName} mengundang Anda untuk bergabung.</p>
      </div>

      <p className="text-text-muted rounded-inner bg-surface-raised p-3 text-sm">
        Bergabung tidak membagikan data keuangan Anda.
      </p>

      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        {state.error && (
          <p role="alert" className="text-negative mb-3 text-sm">
            {state.error}
          </p>
        )}
        <AcceptButton />
      </form>
    </Card>
  );
}
