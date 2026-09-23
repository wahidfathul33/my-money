'use client';

import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { archiveCategoryAction, reorderCategoriesAction, restoreCategoryAction } from '../actions';
import type { CategoryRow, CategoryWithChildren } from '../queries';
import { CategoryIcon } from './category-icon';
import { CategorySheet } from './category-sheet';
import { DeleteCategoryDialog } from './delete-category-dialog';

interface CategoryListProps {
  type: 'expense' | 'income';
  categories: CategoryWithChildren[];
}

type SheetState = { mode: 'create' } | { mode: 'edit'; category: CategoryRow };

/**
 * Hierarchical, one level deep (docs/03 §7.3) — top-level categories with
 * their sub-categories indented underneath. Reordering (up/down; no
 * drag-and-drop library in this project's dependencies) applies to
 * top-level categories only, matching the settings page's Pengeluaran /
 * Pemasukan tabs — sub-category order is fixed to creation order for v1.
 */
export function CategoryList({ type, categories }: CategoryListProps) {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);
  const [order, setOrder] = useState(categories);
  // Tracks the last `categories` prop `order` was synced FROM — not the
  // same thing as `order` itself, which also changes from local reorder
  // clicks below. Comparing by reference (a fresh array from the Server
  // Component after every router.refresh(), whatever triggered it) is what
  // makes this fire on ANY server-side change, not just an add/remove: an
  // earlier version of this compared id LISTS instead, which silently
  // missed rename/archive/icon/color edits — none of those change which
  // ids are present, so a `join()`-based check never saw them and the row
  // kept rendering stale data until an unrelated add/remove happened to
  // resync it.
  const [syncedFrom, setSyncedFrom] = useState(categories);
  if (categories !== syncedFrom) {
    setSyncedFrom(categories);
    setOrder(categories);
  }
  const [, startTransition] = useTransition();

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    setOrder(next);
    startTransition(async () => {
      await reorderCategoriesAction(next.map((c) => c.id));
      router.refresh();
    });
  }

  function toggleArchive(category: CategoryRow) {
    startTransition(async () => {
      if (category.isArchived) {
        await restoreCategoryAction(category.id);
      } else {
        await archiveCategoryAction(category.id);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Button onClick={() => setSheet({ mode: 'create' })} className="self-start">
        <Plus className="size-4" aria-hidden="true" />
        Kategori Baru
      </Button>

      {order.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Belum ada kategori"
          description="Kategori bawaan seharusnya sudah ada — coba muat ulang halaman."
        />
      ) : (
        <ul className="divide-separator border-border rounded-card divide-y border">
          {order.map((category, index) => (
            <li key={category.id}>
              <CategoryListRow
                category={category}
                canMoveUp={index > 0}
                canMoveDown={index < order.length - 1}
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                onEdit={() => setSheet({ mode: 'edit', category })}
                onToggleArchive={() => toggleArchive(category)}
                onDelete={() => setDeleteTarget(category)}
              />
              {category.children.length > 0 && (
                <ul className="border-border bg-surface-raised/40 border-t">
                  {category.children.map((child) => (
                    <li key={child.id} className="pl-8">
                      <CategoryListRow
                        category={child}
                        onEdit={() => setSheet({ mode: 'edit', category: child })}
                        onToggleArchive={() => toggleArchive(child)}
                        onDelete={() => setDeleteTarget(child)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <CategorySheet
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
        type={type}
        category={sheet?.mode === 'edit' ? sheet.category : undefined}
        parentOptions={order
          .filter((c) => (sheet?.mode === 'edit' ? c.id !== sheet.category.id : true))
          .map((c) => ({ id: c.id, name: c.name }))}
      />

      {deleteTarget && (
        <DeleteCategoryDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          category={deleteTarget}
        />
      )}
    </div>
  );
}

interface CategoryListRowProps {
  category: CategoryRow;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onEdit: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}

function CategoryListRow({
  category,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onEdit,
  onToggleArchive,
  onDelete,
}: CategoryListRowProps) {
  const isBuiltIn = category.systemKey !== null;

  return (
    <div
      className={cn(
        'list-row flex items-center gap-3 px-4 py-3',
        category.isArchived && 'opacity-60',
      )}
    >
      <CategoryIcon icon={category.icon} color={category.color} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="text-text truncate text-sm font-medium">{category.name}</span>
          {isBuiltIn && (
            <span className="bg-surface-raised text-text-muted rounded-chip px-2 py-0.5 text-xs">
              Bawaan
            </span>
          )}
          {category.isArchived && (
            <span className="bg-surface-raised text-text-muted rounded-chip px-2 py-0.5 text-xs">
              Diarsipkan
            </span>
          )}
        </div>
      </div>

      {onMoveUp && onMoveDown && (
        <div className="flex flex-col">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label={`Pindahkan ${category.name} ke atas`}
            className="pressable text-text-muted flex size-8 items-center justify-center disabled:opacity-30"
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label={`Pindahkan ${category.name} ke bawah`}
            className="pressable text-text-muted flex size-8 items-center justify-center disabled:opacity-30"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${category.name}`}
        className="pressable text-text-muted flex size-11 items-center justify-center"
      >
        <Pencil className="size-4" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={onToggleArchive}
        aria-label={category.isArchived ? `Pulihkan ${category.name}` : `Arsipkan ${category.name}`}
        className="pressable text-text-muted flex size-11 items-center justify-center"
      >
        {category.isArchived ? (
          <ArchiveRestore className="size-4" aria-hidden="true" />
        ) : (
          <Archive className="size-4" aria-hidden="true" />
        )}
      </button>

      {!isBuiltIn && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Hapus ${category.name}`}
          className="pressable text-text-muted flex size-11 items-center justify-center"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
