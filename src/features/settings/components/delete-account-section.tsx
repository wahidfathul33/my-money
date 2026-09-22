'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DeleteAccountDialog } from './delete-account-dialog';

interface DeleteAccountSectionProps {
  email: string;
}

export function DeleteAccountSection({ email }: DeleteAccountSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Button variant="danger" className="w-full" onClick={() => setOpen(true)}>
        Hapus akun
      </Button>
      <DeleteAccountDialog open={open} onOpenChange={setOpen} email={email} />
    </div>
  );
}
