'use client';

/**
 * Category chips — docs/09 §2: "4 yang paling sering dipakai 30 hari
 * terakhir, ditambah 'lainnya' yang membuka grid penuh." `quick`/`full` are
 * server-fetched props (src/features/transactions/queries.ts
 * `getQuickCategories`/`listCategories`), not fetched here — this component
 * stays a pure controlled picker.
 */
import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { CategoryIcon } from '@/features/categories/components/category-icon';
import { cn } from '@/lib/utils';
import type { CategoryRow, CategoryWithChildren } from '../queries';

interface CategoryPickerProps {
  quick: CategoryRow[];
  full: CategoryWithChildren[];
  value: string | null;
  onChange: (categoryId: string) => void;
}

export function CategoryPicker({ quick, full, value, onChange }: CategoryPickerProps) {
  const [gridOpen, setGridOpen] = useState(false);
  const valueInQuick = quick.some((c) => c.id === value);
  const lainnyaSelected = value !== null && !valueInQuick;

  function selectFromGrid(id: string) {
    onChange(id);
    setGridOpen(false);
  }

  return (
    <div>
      <p className="text-text mb-2 text-sm font-medium">Kategori</p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {quick.map((category) => (
          <CategoryChip
            key={category.id}
            name={category.name}
            icon={category.icon}
            color={category.color}
            selected={value === category.id}
            onSelect={() => onChange(category.id)}
          />
        ))}

        <button
          type="button"
          aria-pressed={lainnyaSelected}
          onClick={() => setGridOpen(true)}
          className="pressable flex w-16 shrink-0 flex-col items-center gap-1"
        >
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full',
              lainnyaSelected
                ? 'bg-brand-subtle text-brand-readable ring-brand ring-2'
                : 'bg-surface-raised text-text-muted',
            )}
          >
            <MoreHorizontal className="size-5" aria-hidden="true" />
          </span>
          <span className="text-text-muted w-full truncate text-center text-[11px]">Lainnya</span>
        </button>
      </div>

      <Sheet open={gridOpen} onOpenChange={setGridOpen}>
        <SheetContent title="Pilih kategori">
          <div className="grid grid-cols-4 gap-3">
            {full.flatMap((category) => [category, ...category.children]).map((category) => (
              <CategoryChip
                key={category.id}
                name={category.name}
                icon={category.icon}
                color={category.color}
                selected={value === category.id}
                onSelect={() => selectFromGrid(category.id)}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface CategoryChipProps {
  name: string;
  icon: string;
  color: string;
  selected: boolean;
  onSelect: () => void;
}

function CategoryChip({ name, icon, color, selected, onSelect }: CategoryChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className="pressable flex w-16 shrink-0 flex-col items-center gap-1"
    >
      <CategoryIcon icon={icon} color={color} className={cn(selected && 'ring-brand ring-2')} />
      <span
        className={cn(
          'w-full truncate text-center text-[11px]',
          selected ? 'text-brand-readable font-medium' : 'text-text-muted',
        )}
      >
        {name}
      </span>
    </button>
  );
}
