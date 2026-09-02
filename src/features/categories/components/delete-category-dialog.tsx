'use client';

import { Archive } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/sheet';
import {
  archiveCategoryAction,
  deleteCategoryAction,
  getCategoryUsageCountAction,
} from '../actions';
import type { CategoryRow } from '../queries';

interface DeleteCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryRow;
}

/**
 * tasks/06-categories/todo.md "Dialog hapus: bila terpakai, tampilkan
 * jumlah transaksi + tawarkan arsip." Usage count is fetched when the
 * dialog opens so the choice (delete vs. archive) is informed up front,
 * rather than discovered only after a rejected delete attempt.
 */
export function DeleteCategoryDialog({ open, onOpenChange, category }: DeleteCategoryDialogProps) {
  const router = useRouter();
  const [usageCount, setUsageCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The caller (CategoryList) only mounts this component while there's an
  // active delete target, so `usageCount`/`error`'s `useState(null)`
  // initializers are already fresh per category — no reset needed, just
  // the fetch itself (a genuine effect: reading from an external system).
  useEffect(() => {
    if (!open) return;
    void getCategoryUsageCountAction(category.id).then(setUsageCount);
  }, [open, category.id]);

  const isUsed = (usageCount ?? 0) > 0;

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteCategoryAction(category.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveCategoryAction(category.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="center" title={`Hapus "${category.name}"?`}>
        <div className="flex flex-col gap-4">
          {usageCount === null ? (
            <p className="text-text-muted text-sm">Memeriksa pemakaian…</p>
          ) : isUsed ? (
            <p className="text-text-muted text-sm">
              Kategori ini dipakai <strong className="text-text">{usageCount}</strong> transaksi dan
              tidak dapat dihapus. Arsipkan agar tidak muncul lagi saat mencatat, tanpa mengubah
              riwayat transaksi.
            </p>
          ) : (
            <p className="text-text-muted text-sm">
              Kategori ini belum dipakai transaksi mana pun. Tindakan ini tidak dapat dibatalkan.
            </p>
          )}

          {error && (
            <p role="alert" className="text-negative text-sm">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {isUsed ? (
              <Button onClick={handleArchive} loading={pending} className="w-full">
                <Archive className="size-4" aria-hidden="true" />
                Arsipkan sebagai gantinya
              </Button>
            ) : (
              <Button
                variant="danger"
                onClick={handleDelete}
                loading={pending}
                disabled={usageCount === null}
                className="w-full"
              >
                Hapus Kategori
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full">
              Batal
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
