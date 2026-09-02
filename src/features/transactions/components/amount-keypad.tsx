'use client';

/**
 * Custom numeric keypad — docs/09-screen-specs.md §2, tasks/07-transactions-core/spec.md
 * "Catatan": a native OS keyboard is deliberately NOT used here. Its height
 * varies by device and often covers the save button; this keypad's height
 * is fixed, `000` saves taps on rupiah amounts, and `+`/`−` let a
 * calculator-style correction (`45000 + 12000`) get typed inline.
 *
 * Purely a controlled view over the `expression` string — all the actual
 * arithmetic (append/backspace/evaluate) lives in ../amount-math.ts as pure,
 * independently-tested functions. The `✓` key IS the sheet's save button
 * (matches the wireframe's 4×4 grid — there's no separate "Simpan" button
 * elsewhere), disabled by the caller once amount/category requirements
 * aren't met.
 */
import { Check, Delete, Loader2 } from 'lucide-react';
import { appendDecimalPoint, appendDigits, appendOperator, backspace } from '../amount-math';
import type { KeypadOperator } from '../amount-math';
import { cn } from '@/lib/utils';

interface AmountKeypadProps {
  expression: string;
  onExpressionChange: (next: string) => void;
  onSave: () => void;
  saveDisabled: boolean;
  saving: boolean;
}

// h-16 (64px) — comfortably over the 44px touch-target floor (docs/07 §9)
// even accounting for the grid's own gap eating into each cell's hit area.
const KEY_BASE = 'pressable flex h-16 items-center justify-center rounded-inner text-title font-medium';
const NUMBER_KEY = cn(KEY_BASE, 'bg-surface-raised text-text');
const OP_KEY = cn(KEY_BASE, 'bg-surface-raised text-brand-readable');

export function AmountKeypad({
  expression,
  onExpressionChange,
  onSave,
  saveDisabled,
  saving,
}: AmountKeypadProps) {
  function digit(value: string) {
    onExpressionChange(appendDigits(expression, value));
  }
  function operator(op: KeypadOperator) {
    onExpressionChange(appendOperator(expression, op));
  }

  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Keypad nominal">
      <button type="button" className={NUMBER_KEY} onClick={() => digit('1')}>
        1
      </button>
      <button type="button" className={NUMBER_KEY} onClick={() => digit('2')}>
        2
      </button>
      <button type="button" className={NUMBER_KEY} onClick={() => digit('3')}>
        3
      </button>
      <button
        type="button"
        className={OP_KEY}
        aria-label="Hapus"
        onClick={() => onExpressionChange(backspace(expression))}
      >
        <Delete className="size-5" aria-hidden="true" />
      </button>

      <button type="button" className={NUMBER_KEY} onClick={() => digit('4')}>
        4
      </button>
      <button type="button" className={NUMBER_KEY} onClick={() => digit('5')}>
        5
      </button>
      <button type="button" className={NUMBER_KEY} onClick={() => digit('6')}>
        6
      </button>
      <button type="button" className={OP_KEY} aria-label="Tambah" onClick={() => operator('+')}>
        +
      </button>

      <button type="button" className={NUMBER_KEY} onClick={() => digit('7')}>
        7
      </button>
      <button type="button" className={NUMBER_KEY} onClick={() => digit('8')}>
        8
      </button>
      <button type="button" className={NUMBER_KEY} onClick={() => digit('9')}>
        9
      </button>
      <button type="button" className={OP_KEY} aria-label="Kurang" onClick={() => operator('-')}>
        −
      </button>

      <button type="button" className={NUMBER_KEY} onClick={() => digit('0')}>
        0
      </button>
      <button type="button" className={cn(NUMBER_KEY, 'text-body')} onClick={() => digit('000')}>
        000
      </button>
      <button
        type="button"
        className={NUMBER_KEY}
        aria-label="Titik desimal"
        onClick={() => onExpressionChange(appendDecimalPoint(expression))}
      >
        .
      </button>
      <button
        type="button"
        aria-label="Simpan"
        disabled={saveDisabled}
        onClick={onSave}
        className={cn(KEY_BASE, 'bg-brand-hover text-on-brand disabled:opacity-40')}
      >
        {saving ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="size-5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
