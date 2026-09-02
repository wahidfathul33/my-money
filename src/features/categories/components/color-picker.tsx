'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_COLOR_SWATCHES } from '../category-colors';
import type { CategoryColor } from '@/lib/services/categories';

interface ColorPickerProps {
  value: string;
  onChange: (color: CategoryColor) => void;
}

/**
 * A curated palette, not a free color picker — tasks/06-categories/spec.md
 * "Batasan: Jangan … unggahan ikon" applies the same "curated set, not
 * open-ended input" reasoning to color (docs/03 §7.3 doesn't single color
 * out, but an unconstrained `<input type="color">` would let every category
 * end up a slightly different shade, defeating the point of a fixed swatch
 * a user can recognize at a glance).
 */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Pilih warna">
      {CATEGORY_COLOR_SWATCHES.map(({ color, classes }) => {
        const selected = color === value;
        return (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            aria-pressed={selected}
            aria-label={color}
            title={color}
            className={cn(
              'pressable flex size-11 items-center justify-center rounded-full',
              classes.bg,
              selected && `ring-offset-surface ring-2 ring-offset-2 ${classes.ring}`,
            )}
          >
            {selected && <Check className={cn('size-5', classes.text)} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
