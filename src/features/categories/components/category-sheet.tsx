'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import type { IconName } from '@/lib/icons';
import type { CategoryColor } from '@/lib/services/categories';
import {
  CATEGORY_FORM_IDLE_STATE,
  createCategoryAction,
  updateCategoryAction,
  type CategoryFormState,
} from '../actions';
import type { CategoryRow } from '../queries';
import { CategoryIcon } from './category-icon';
import { ColorPicker } from './color-picker';
import { IconPicker } from './icon-picker';

const NO_PARENT = 'none';

interface CategorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'expense' | 'income';
  /** `undefined` = create mode; provided = edit mode (renaming a built-in category included). */
  category?: CategoryRow;
  /** Candidate parents: the caller's own top-level categories of this type, excluding `category` itself and any category that already has children. */
  parentOptions: { id: string; name: string }[];
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full">
      {label}
    </Button>
  );
}

/**
 * Create/edit sheet — one component for both, matching the Sheet/Dialog
 * "same component, different variant" pattern (src/components/ui/sheet.tsx).
 *
 * `<Sheet>`/`<SheetContent>` stay mounted continuously regardless of `open`
 * (never conditionally removed from the tree by this component or its
 * caller) — that's what lets Radix's own `open`-prop-driven CSS animation
 * play in both directions, per sheet.tsx's doc comment. The actual form —
 * and everything it holds local state for (icon/color/parent) — lives in
 * `CategorySheetForm` below, rendered only while `open` is true. Gating it
 * that way, rather than resetting local state in a `useEffect` keyed on
 * `open`/`category` (which `react-hooks/set-state-in-effect` flags as a
 * synchronous setState-in-effect anti-pattern), means every open — for a
 * fresh create or for a different category to edit — mounts a brand new
 * `CategorySheetForm`, whose `useState` initializers read the CURRENT
 * `category` prop for free.
 */
export function CategorySheet({
  open,
  onOpenChange,
  type,
  category,
  parentOptions,
}: CategorySheetProps) {
  const isEdit = category !== undefined;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={isEdit ? 'Edit Kategori' : 'Kategori Baru'}>
        {open && (
          <CategorySheetForm
            type={type}
            category={category}
            parentOptions={parentOptions}
            onDone={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

interface CategorySheetFormProps {
  type: 'expense' | 'income';
  category?: CategoryRow;
  parentOptions: { id: string; name: string }[];
  onDone: () => void;
}

function CategorySheetForm({ type, category, parentOptions, onDone }: CategorySheetFormProps) {
  const isEdit = category !== undefined;
  const isBuiltIn = isEdit && category.systemKey !== null;
  const action = isEdit ? updateCategoryAction : createCategoryAction;
  const [state, formAction] = useActionState<CategoryFormState, FormData>(
    action,
    CATEGORY_FORM_IDLE_STATE,
  );

  const [icon, setIcon] = useState<string>(category?.icon ?? 'tag');
  const [color, setColor] = useState<string>(category?.color ?? 'slate');
  const [parentId, setParentId] = useState<string>(category?.parentId ?? NO_PARENT);

  // Notifying the PARENT that submission succeeded (so it can close the
  // sheet) is a callback into an external owner, not this component's own
  // state — the pattern `react-hooks/set-state-in-effect` intends to allow
  // ("subscribe for updates from some external system").
  useEffect(() => {
    if (state.status === 'success') onDone();
  }, [state, onDone]);

  const error = state.status === 'error' ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {isEdit && <input type="hidden" name="categoryId" value={category.id} />}
      {!isEdit && <input type="hidden" name="type" value={type} />}
      <input type="hidden" name="icon" value={icon} />
      <input type="hidden" name="color" value={color} />
      <input type="hidden" name="parentId" value={parentId === NO_PARENT ? '' : parentId} />

      <div className="flex items-center gap-3">
        <CategoryIcon icon={icon} color={color} />
        <Input
          label="Nama kategori"
          name="name"
          defaultValue={category?.name ?? ''}
          maxLength={40}
          required
          error={state.status === 'error' ? state.fields?.name?.[0] : undefined}
          className="flex-1"
        />
      </div>

      {isBuiltIn && (
        <p className="text-text-muted bg-surface-raised rounded-inner px-3 py-2 text-sm">
          Kategori bawaan — nama boleh diganti, tapi tidak bisa dihapus atau dipindah jadi
          sub-kategori.
        </p>
      )}

      {!isBuiltIn && parentOptions.length > 0 && (
        <Select
          label="Sub-kategori dari"
          placeholder="Tidak ada (kategori utama)"
          value={parentId}
          onValueChange={setParentId}
          options={[
            { value: NO_PARENT, label: 'Tidak ada (kategori utama)' },
            ...parentOptions.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      )}

      <div>
        <p className="text-text mb-2 text-sm font-medium">Ikon</p>
        <IconPicker value={icon} onChange={(next: IconName) => setIcon(next)} />
      </div>

      <div>
        <p className="text-text mb-2 text-sm font-medium">Warna</p>
        <ColorPicker value={color} onChange={(next: CategoryColor) => setColor(next)} />
      </div>

      {error && (
        <p role="alert" className="text-negative text-sm">
          {error}
        </p>
      )}

      <SubmitButton label={isEdit ? 'Simpan' : 'Buat Kategori'} />
    </form>
  );
}
