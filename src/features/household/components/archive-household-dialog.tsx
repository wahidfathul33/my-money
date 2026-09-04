'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/sheet';
import { archiveHouseholdAction } from '../actions';

interface ArchiveHouseholdDialogProps {
  householdId: string;
  householdName: string;
  memberCount: number;
}

/**
 * docs/10-ux-states.md §5.1: mengarsipkan household requires confirmation
 * that names the household and the number of members affected. Archiving
 * never touches member data (docs/03 §4.4) — the dialog copy says so
 * explicitly, the same reassurance pattern as the share-wealth dialog.
 */
export function ArchiveHouseholdDialog({
  householdId,
  householdName,
  memberCount,
}: ArchiveHouseholdDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveHouseholdAction(householdId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push('/household');
    });
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Arsipkan keluarga
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent variant="center" title={`Arsipkan ${householdName}?`}>
          <div className="flex flex-col gap-4">
            <p className="text-text-muted text-sm">
              {memberCount} anggota tidak lagi melihat {householdName} di daftar keluarga. Data
              masing-masing anggota — dompet, transaksi, dan tag yang sudah ada — tidak berubah
              sama sekali.
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
              <Button
                variant="danger"
                className="flex-1"
                loading={isPending}
                onClick={handleArchive}
              >
                Arsipkan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
