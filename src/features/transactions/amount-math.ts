/**
 * Pure keypad arithmetic — docs/09-screen-specs.md §2 ("`+` dan `−` melakukan
 * aritmetika berurutan: `45000 + 12000` → tekan `✓` mengevaluasi lalu
 * mengirim"), tasks/07-transactions-core/spec.md.
 *
 * The keypad's model is a single "expression" string built purely from user
 * taps — digits, at most one `.` per term, and `+`/`-` between terms (e.g.
 * `"45000+12000"`). No I/O, no framework imports (same discipline as
 * src/lib/finance/money.ts) so this is trivially unit-testable and reusable
 * from both the keypad component and its tests.
 *
 * Because the keypad only ever supports `+`/`-` (no `*`/`/`), there is no
 * operator precedence to reason about — evaluating "sequentially" left to
 * right produces the exact same result as summing every signed term, which
 * is what `evaluateExpression` does.
 */
import { fromRupiah, MINOR_UNITS, type Money } from '@/lib/finance/money';

export type KeypadOperator = '+' | '-';

// Defensive cap on a single term's digit count — not a business rule, just a
// guard against a runaway tap sequence producing a BigInt so large it stops
// being meaningful (or risks overflowing `bigint` DB columns downstream).
const MAX_TERM_DIGITS = 15;

function currentTerm(expression: string): string {
  const parts = expression.split(/[+-]/);
  return parts[parts.length - 1] ?? '';
}

/** Appends digits typed on the keypad (a single digit, or the `000` shortcut) to the current term. */
export function appendDigits(expression: string, digits: string): string {
  const term = currentTerm(expression);
  if (term.replace('.', '').length >= MAX_TERM_DIGITS) return expression;
  return expression + digits;
}

/** Appends `.` — at most one per term; starts a fresh term as `0.` so `.5` reads as `0,5`, not a bare `,5`. */
export function appendDecimalPoint(expression: string): string {
  const term = currentTerm(expression);
  if (term.includes('.')) return expression;
  return term === '' ? `${expression}0.` : `${expression}.`;
}

/** Appends `+`/`-`. Can't lead the expression; tapping an operator twice in a row replaces the first, not stacks. */
export function appendOperator(expression: string, operator: KeypadOperator): string {
  if (expression === '') return expression;
  return expression.replace(/[+-]$/, '') + operator;
}

export function backspace(expression: string): string {
  return expression.slice(0, -1);
}

/**
 * Evaluates the expression to a signed `Money` in minor units. A trailing
 * operator (user tapped `+` then Simpan without a second number) is dropped
 * silently — the amount is whatever was typed before it.
 */
export function evaluateExpression(expression: string): Money {
  const trimmed = expression.replace(/[+-]$/, '');
  if (trimmed === '') return 0n;

  const terms = trimmed.match(/[+-]?[^+-]+/g) ?? [];
  return terms.reduce<Money>((sum, term) => {
    const negative = term.startsWith('-');
    const magnitude = term.replace(/^[+-]/, '') || '0';
    const value = fromRupiah(magnitude);
    return sum + (negative ? -value : value);
  }, 0n);
}

function formatTerm(term: string): string {
  const [whole = '', frac] = term.split('.');
  const groupedWhole = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac === undefined ? groupedWhole : `${groupedWhole},${frac}`;
}

/**
 * Inverse of `evaluateExpression` for a single, already-settled `Money`
 * value — seeds the keypad's expression when opening the edit sheet on an
 * existing transaction (its amount is a plain number at that point, never
 * an unevaluated `+`/`−` chain — that only exists transiently while typing).
 * Sign is dropped: the keypad expression never encodes sign, the type tab
 * does (docs/03 §8.1).
 */
export function moneyToExpression(amount: Money): string {
  const magnitude = amount < 0n ? -amount : amount;
  const whole = magnitude / MINOR_UNITS;
  const cents = magnitude % MINOR_UNITS;
  return cents === 0n ? whole.toString() : `${whole}.${cents.toString().padStart(2, '0')}`;
}

/**
 * Formats the expression for the live display — thousands separators per
 * term, id-ID decimal comma, operators spaced out (`45.000 + 12.000`). Pure
 * string formatting; NOT `formatIDR` (docs/05 §2 forbids money-formatting
 * detours around it for stored amounts, but this never touches a stored
 * `Money` value — it renders keystrokes still being typed).
 */
export function formatExpression(expression: string): string {
  if (expression === '') return '0';
  const parts = expression.match(/[+-]|[^+-]+/g) ?? [];
  return parts
    .map((part) => (part === '+' || part === '-' ? ` ${part === '-' ? '−' : '+'} ` : formatTerm(part)))
    .join('');
}
