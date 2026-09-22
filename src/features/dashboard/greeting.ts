/**
 * Time-of-day greeting — docs/09-screen-specs.md §1's mockup: "Selamat
 * pagi, Dimas". Pure function (no I/O, no framework import — same
 * discipline as src/lib/date/timezone.ts) so it's trivially unit-testable;
 * the caller resolves "now" in the user's own timezone first (same pattern
 * every other dashboard query takes `now`/`tz` rather than reading the
 * clock itself).
 */
export function greetingForHour(hour: number): string {
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}
