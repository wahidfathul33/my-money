'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { inviteMemberAction } from '../invitations';
import { OK, type ActionState } from '../action-state';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full">
      Kirim undangan
    </Button>
  );
}

/**
 * docs/08-copywriting.md §6.1 — exact copy: judul "Undang anggota keluarga",
 * deskripsi "Ajak anggota keluarga melihat dan merencanakan keuangan
 * bersama.", tombol "Kirim undangan". Email-only field — the resulting
 * membership is ALWAYS `role = 'member'` (docs/03 §4.3), so there is no
 * role picker here to omit-by-mistake; there was never one to begin with.
 */
export function InviteSheet({ householdId }: { householdId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    inviteMemberAction,
    OK,
  );

  const wasPending = useRef(isPending);
  useEffect(() => {
    if (wasPending.current && !isPending && state.error === null) {
      toast.show({ title: 'Undangan terkirim', variant: 'success' });
      setOpen(false);
      router.refresh();
    }
    wasPending.current = isPending;
  }, [isPending, state.error, router, toast]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <UserPlus className="size-4" aria-hidden="true" />
          Undang anggota
        </Button>
      </SheetTrigger>
      <SheetContent
        title="Undang anggota keluarga"
        description="Ajak anggota keluarga melihat dan merencanakan keuangan bersama."
      >
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="householdId" value={householdId} />
          <Input
            label="Email"
            name="email"
            type="text"
            inputMode="email"
            placeholder="nama@email.com"
            required
            autoFocus
          />

          <p className="text-text-muted text-sm">
            Data keuangan Anda tetap pribadi kecuali Anda membagikannya. Bergabung tidak
            membagikan data keuangan siapa pun secara otomatis.
          </p>

          {state.error && (
            <p role="alert" className="text-negative text-sm">
              {state.error}
            </p>
          )}

          <SubmitButton />
        </form>
      </SheetContent>
    </Sheet>
  );
}
