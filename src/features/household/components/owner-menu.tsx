'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, Dialog, DialogContent } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { transferOwnershipAction } from '../members';
import { OK } from '../action-state';
import { RemoveMemberDialog } from './remove-member-dialog';

interface TransferOwnershipDialogProps {
  householdId: string;
  memberUserId: string;
  memberName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Calls `transferOwnershipAction` directly inside `useTransition` — NOT
 * `useActionState` + a `<form action>` + a "pending flipped to false"
 * effect, unlike e.g. src/features/household/components/household-settings-form.tsx.
 * That pattern is only safe when the component reacting to success stays
 * mounted afterward. Here it doesn't: a successful transfer makes the
 * CALLER (owner) a regular member, so `isOwner` flips to `false` for their
 * own page render and every `OwnerMenu` — this dialog included — disappears
 * from the next server-rendered tree as soon as `revalidatePath` takes
 * effect. When that removal and `useActionState`'s "pending -> false"
 * transition land in the same reconciliation, React unmounts the component
 * without ever committing the render that would have run the success
 * effect — the toast silently never fires (found via a real e2e run of
 * the equivalent bug in RemoveMemberDialog, see its own doc comment).
 * Handling the result inline, in the same async callback that made the
 * call, has no such race: it runs to completion regardless of what the
 * server-driven re-render does afterward. Same fix as
 * src/features/household/components/archive-household-dialog.tsx (task 10),
 * which has the identical "success removes my own container" shape.
 */
function TransferOwnershipDialog({
  householdId,
  memberUserId,
  memberName,
  open,
  onOpenChange,
}: TransferOwnershipDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function handleConfirm() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('householdId', householdId);
      formData.set('newOwnerUserId', memberUserId);
      const result = await transferOwnershipAction(OK, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      toast.show({ title: `${memberName} sekarang pemilik`, variant: 'success' });
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
      <DialogContent variant="center" title={`Jadikan ${memberName} pemilik?`}>
        <div className="flex flex-col gap-4">
          <p className="text-text-muted text-sm">
            Anda akan menjadi anggota biasa. {memberName} akan dapat mengundang, mengeluarkan
            anggota, dan mengubah pengaturan keluarga.
          </p>

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
            <Button className="flex-1" loading={isPending} onClick={handleConfirm}>
              Jadikan pemilik
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface OwnerMenuProps {
  householdId: string;
  memberUserId: string;
  memberName: string;
  taggedTransactionCount: number;
}

/**
 * The `⋮` menu owner-only actions in todo.md's UI section: "Jadikan
 * pemilik" and "Keluarkan". This app has no dropdown-menu primitive
 * (components/ui only has Sheet/Dialog, Tabs, Select, ...), so this reuses
 * the same bottom-sheet-as-action-list pattern the rest of the app already
 * relies on for confirmations — a small action sheet, then a dedicated
 * confirm dialog per choice. Rendering this at all is a UI convenience, not
 * the security boundary: `removeMember`/`transferOwnership`
 * (src/lib/services/memberships.ts) re-verify the caller is the owner
 * inside their own transaction regardless of what a tampered client sends.
 */
export function OwnerMenu({
  householdId,
  memberUserId,
  memberName,
  taggedTransactionCount,
}: OwnerMenuProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Aksi untuk ${memberName}`}
          onClick={() => setSheetOpen(true)}
        >
          <MoreVertical className="size-4" aria-hidden="true" />
        </Button>
        <SheetContent title={`Aksi untuk ${memberName}`} hideTitle>
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => {
                setSheetOpen(false);
                setTransferOpen(true);
              }}
            >
              Jadikan pemilik
            </Button>
            <Button
              variant="ghost"
              className="text-negative justify-start"
              onClick={() => {
                setSheetOpen(false);
                setRemoveOpen(true);
              }}
            >
              Keluarkan dari keluarga
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <TransferOwnershipDialog
        householdId={householdId}
        memberUserId={memberUserId}
        memberName={memberName}
        open={transferOpen}
        onOpenChange={setTransferOpen}
      />
      <RemoveMemberDialog
        householdId={householdId}
        memberUserId={memberUserId}
        memberName={memberName}
        taggedTransactionCount={taggedTransactionCount}
        open={removeOpen}
        onOpenChange={setRemoveOpen}
      />
    </>
  );
}
