/**
 * Tailwind class lookup for `CATEGORY_COLORS` (src/lib/services/categories.ts).
 * Tailwind's build-time scanner only picks up class names that appear as
 * literal strings in source — `` `bg-${color}-100` `` would silently ship no
 * CSS at all, so every color needs its classes spelled out here instead of
 * assembled at runtime. `dark:` in this app follows the user's theme
 * setting — OS preference by default, overridable to light/dark via
 * `data-theme` on `<html>` (see `@custom-variant dark` in
 * src/app/globals.css and src/lib/theme.ts) — so light/dark both fall out
 * of the same class list.
 */
import { CATEGORY_COLORS, type CategoryColor } from '@/lib/services/categories';

export interface CategoryColorClasses {
  /** Swatch background — used for the icon picker's colored circle and the color picker's own swatch buttons. */
  bg: string;
  /** Glyph/text color on top of `bg`. */
  text: string;
  /** Ring shown on the selected swatch in the color picker. */
  ring: string;
}

const CATEGORY_COLOR_CLASSES: Record<CategoryColor, CategoryColorClasses> = {
  slate: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-300',
    ring: 'ring-slate-500',
  },
  red: {
    bg: 'bg-red-100 dark:bg-red-950/50',
    text: 'text-red-600 dark:text-red-400',
    ring: 'ring-red-500',
  },
  orange: {
    bg: 'bg-orange-100 dark:bg-orange-950/50',
    text: 'text-orange-600 dark:text-orange-400',
    ring: 'ring-orange-500',
  },
  amber: {
    bg: 'bg-amber-100 dark:bg-amber-950/50',
    text: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-amber-500',
  },
  green: {
    bg: 'bg-green-100 dark:bg-green-950/50',
    text: 'text-green-600 dark:text-green-400',
    ring: 'ring-green-500',
  },
  emerald: {
    bg: 'bg-emerald-100 dark:bg-emerald-950/50',
    text: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-500',
  },
  teal: {
    bg: 'bg-teal-100 dark:bg-teal-950/50',
    text: 'text-teal-600 dark:text-teal-400',
    ring: 'ring-teal-500',
  },
  cyan: {
    bg: 'bg-cyan-100 dark:bg-cyan-950/50',
    text: 'text-cyan-600 dark:text-cyan-400',
    ring: 'ring-cyan-500',
  },
  sky: {
    bg: 'bg-sky-100 dark:bg-sky-950/50',
    text: 'text-sky-600 dark:text-sky-400',
    ring: 'ring-sky-500',
  },
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-950/50',
    text: 'text-blue-600 dark:text-blue-400',
    ring: 'ring-blue-500',
  },
  indigo: {
    bg: 'bg-indigo-100 dark:bg-indigo-950/50',
    text: 'text-indigo-600 dark:text-indigo-400',
    ring: 'ring-indigo-500',
  },
  violet: {
    bg: 'bg-violet-100 dark:bg-violet-950/50',
    text: 'text-violet-600 dark:text-violet-400',
    ring: 'ring-violet-500',
  },
  fuchsia: {
    bg: 'bg-fuchsia-100 dark:bg-fuchsia-950/50',
    text: 'text-fuchsia-600 dark:text-fuchsia-400',
    ring: 'ring-fuchsia-500',
  },
  pink: {
    bg: 'bg-pink-100 dark:bg-pink-950/50',
    text: 'text-pink-600 dark:text-pink-400',
    ring: 'ring-pink-500',
  },
  rose: {
    bg: 'bg-rose-100 dark:bg-rose-950/50',
    text: 'text-rose-600 dark:text-rose-400',
    ring: 'ring-rose-500',
  },
};

export function categoryColorClasses(color: string): CategoryColorClasses {
  return CATEGORY_COLOR_CLASSES[color as CategoryColor] ?? CATEGORY_COLOR_CLASSES.slate;
}

export const CATEGORY_COLOR_SWATCHES = CATEGORY_COLORS.map((color) => ({
  color,
  classes: CATEGORY_COLOR_CLASSES[color],
}));
