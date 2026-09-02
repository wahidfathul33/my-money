'use client';

/**
 * Date selector for the meta row — docs/09 §2: "Pemilih tanggal ringkas
 * (Hari ini / Kemarin / pilih)". `type="date"` is a deliberate, narrow
 * exception to "no OS keyboard" (tasks/07 spec.md's keypad rule is about
 * the AMOUNT field specifically) — reimplementing a full calendar widget
 * for the rare "neither today nor yesterday" case isn't worth it here.
 */
import { useState, type ChangeEvent } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface DatePickerProps {
  value: Date;
  onChange: (date: Date) => void;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function formatDateLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, today)) return 'Hari ini';
  if (isSameDay(date, yesterday)) return 'Kemarin';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(date);
}

/** `YYYY-MM-DD` for the native date input's `max` — docs/03 §8.4 "transaction_date ≤ besok". */
function tomorrowInputValue(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

export function DatePicker({ value, onChange }: DatePickerProps) {
  const [open, setOpen] = useState(false);

  function pick(date: Date) {
    onChange(date);
    setOpen(false);
  }

  function pickToday() {
    pick(new Date());
  }

  function pickYesterday() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    pick(yesterday);
  }

  function pickCustom(event: ChangeEvent<HTMLInputElement>) {
    if (!event.target.value) return;
    const [year, month, day] = event.target.value.split('-').map(Number);
    if (!year || !month || !day) return;
    pick(new Date(year, month - 1, day));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable-tint rounded-inner text-text flex h-11 items-center gap-1.5 px-2 text-sm font-medium"
      >
        {formatDateLabel(value)}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Pilih tanggal">
          <div className="flex flex-col gap-2">
            <Button variant="secondary" className="w-full justify-start" onClick={pickToday}>
              Hari ini
            </Button>
            <Button variant="secondary" className="w-full justify-start" onClick={pickYesterday}>
              Kemarin
            </Button>
            <label className="text-text flex h-11 items-center gap-2 text-sm font-medium">
              Pilih tanggal
              <input
                type="date"
                aria-label="Pilih tanggal lain"
                max={tomorrowInputValue()}
                onChange={pickCustom}
                className="rounded-input border-border bg-surface text-body text-text h-11 flex-1 border px-3"
              />
            </label>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
