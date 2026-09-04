'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { resendInvitationAction, revokeInvitationAction } from '../invitations';
import { OK } from '../action-state';

/** docs/08-copywriting.md §6.1: "Menunggu · Diterima · Kedaluwarsa ·
 * Dibatalkan" — this row only ever renders `pending` invitations (see
 * src/features/household/queries.ts's `listPendingInvitations`), so the
 * remaining-time label is the only status text this component needs. */
function remainingLabel(expiresAt: Date): string {
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return 'Kedaluwarsa';
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days <= 1) return 'Berlaku kurang dari 1 hari lagi';
  return `Berlaku ${days} hari lagi`;
}

interface InvitationRowProps {
  householdId: string;
  invitationId: string;
  email: string;
  expiresAt: Date;
}

/**
 * Both actions here call the Server Action DIRECTLY inside `useTransition`
 * rather than `useActionState` + a `<form action>` + a "pending flipped to
 * false" effect — see RemoveMemberDialog's doc comment
 * (src/features/household/components/remove-member-dialog.tsx) for the full
 * explanation of why: a successful revoke OR resend both make THIS row
 * (keyed by `invitation.id`) disappear from the next `listPendingInvitations`
 * render (revoke removes it outright; resend replaces it with a brand new
 * row under a brand new id), which races an effect-based success handler
 * the same way.
 */
export function InvitationRow({ householdId, invitationId, email, expiresAt }: InvitationRowProps) {
  const router = useRouter();
  const toast = useToast();
  const [isResendPending, startResendTransition] = useTransition();
  const [isRevokePending, startRevokeTransition] = useTransition();

  function handleResend() {
    startResendTransition(async () => {
      const formData = new FormData();
      formData.set('householdId', householdId);
      formData.set('invitationId', invitationId);
      const result = await resendInvitationAction(OK, formData);
      if (result.error) {
        toast.show({ title: 'Gagal mengirim ulang', description: result.error, variant: 'error' });
        return;
      }
      toast.show({ title: 'Undangan terkirim', variant: 'success' });
      router.refresh();
    });
  }

  function handleRevoke() {
    startRevokeTransition(async () => {
      const formData = new FormData();
      formData.set('householdId', householdId);
      formData.set('invitationId', invitationId);
      const result = await revokeInvitationAction(OK, formData);
      if (result.error) {
        toast.show({ title: 'Gagal membatalkan', description: result.error, variant: 'error' });
        return;
      }
      toast.show({ title: 'Undangan dibatalkan', variant: 'success' });
      router.refresh();
    });
  }

  return (
    <li className="border-border flex items-center justify-between gap-2 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col">
        <p className="text-text truncate text-sm font-medium">{email}</p>
        <p className="text-text-muted text-xs">{remainingLabel(expiresAt)}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="sm" loading={isResendPending} onClick={handleResend}>
          Kirim ulang
        </Button>
        <Button variant="ghost" size="sm" loading={isRevokePending} onClick={handleRevoke}>
          Cabut
        </Button>
      </div>
    </li>
  );
}
