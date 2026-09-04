'use client';

/**
 * Filter chips — docs/09 §3 wireframe ("Semua · Dompet · Kateg.") plus the
 * two more tasks/09-transaction-history/spec.md's acceptance criteria
 * require but the ASCII wireframe doesn't draw: Tipe and Rentang tanggal.
 * Every chip reads/writes through `useHistoryFilters` — the URL is the only
 * state (docs/02 §6).
 *
 * The chip row scrolls horizontally on its own (`overflow-x-auto`), the
 * same pattern src/features/transactions/components/category-picker.tsx
 * already uses for the quick-pick category strip — this is what keeps the
 * PAGE itself free of horizontal overflow at 360px while still fitting 5
 * chips.
 */
import { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Chip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';
import { Icon } from '@/lib/icons';
import { CategoryIcon } from '@/features/categories/components/category-icon';
import { cn } from '@/lib/utils';
import type { HistoryTransactionType } from '../history-queries';
import { hasActiveFilters, useHistoryFilters } from '../use-history-filters';

export interface FilterBarWalletOption {
  id: string;
  name: string;
  icon: string;
}

export interface FilterBarCategoryOption {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense';
}

interface FilterBarProps {
  wallets: FilterBarWalletOption[];
  categories: FilterBarCategoryOption[];
}

const TYPE_LABEL: Record<HistoryTransactionType, string> = {
  income: 'Pemasukan',
  expense: 'Pengeluaran',
  transfer: 'Transfer',
};

/** `YYYY-MM-DD` for the native date input's `max` — today, in the browser's local time (a loose bound; the server is the real source of truth for "not in the future"). */
function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export function FilterBar({ wallets, categories }: FilterBarProps) {
  const { filters, update, resetFilters } = useHistoryFilters();
  const [openSheet, setOpenSheet] = useState<'wallet' | 'category' | 'type' | 'date' | null>(null);

  const selectedWallet = wallets.find((w) => w.id === filters.walletId);
  const selectedCategory = categories.find((c) => c.id === filters.categoryId);
  const active = hasActiveFilters(filters);

  return (
    <div className="flex gap-2 overflow-x-auto px-page-x pb-1" role="group" aria-label="Filter transaksi">
      <Chip variant="filter" selected={!active} onClick={resetFilters} className="shrink-0">
        Semua
      </Chip>
      <Chip
        variant="filter"
        selected={Boolean(filters.walletId)}
        onClick={() => setOpenSheet('wallet')}
        className="shrink-0"
      >
        {selectedWallet?.name ?? 'Dompet'}
      </Chip>
      <Chip
        variant="filter"
        selected={Boolean(filters.categoryId)}
        onClick={() => setOpenSheet('category')}
        className="shrink-0"
      >
        {selectedCategory?.name ?? 'Kategori'}
      </Chip>
      <Chip
        variant="filter"
        selected={Boolean(filters.type)}
        onClick={() => setOpenSheet('type')}
        className="shrink-0"
      >
        {filters.type ? TYPE_LABEL[filters.type] : 'Tipe'}
      </Chip>
      <Chip
        variant="filter"
        selected={Boolean(filters.from || filters.to)}
        onClick={() => setOpenSheet('date')}
        className="shrink-0"
      >
        Tanggal
      </Chip>

      <Sheet open={openSheet === 'wallet'} onOpenChange={(open) => !open && setOpenSheet(null)}>
        <SheetContent title="Pilih dompet">
          <ul className="flex flex-col">
            <FilterOption
              label="Semua dompet"
              selected={!filters.walletId}
              onSelect={() => {
                update({ walletId: null });
                setOpenSheet(null);
              }}
            />
            {wallets.map((wallet) => (
              <li key={wallet.id}>
                <button
                  type="button"
                  onClick={() => {
                    update({ walletId: wallet.id });
                    setOpenSheet(null);
                  }}
                  aria-pressed={wallet.id === filters.walletId}
                  className={cn(
                    'pressable-tint rounded-inner flex h-12 w-full items-center gap-3 px-2 text-left text-sm',
                    wallet.id === filters.walletId ? 'text-brand-readable bg-brand-subtle' : 'text-text',
                  )}
                >
                  <Icon name={wallet.icon} className="size-5" aria-hidden="true" />
                  {wallet.name}
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      <Sheet open={openSheet === 'category'} onOpenChange={(open) => !open && setOpenSheet(null)}>
        <SheetContent title="Pilih kategori">
          <ul className="flex max-h-[60vh] flex-col overflow-y-auto">
            <FilterOption
              label="Semua kategori"
              selected={!filters.categoryId}
              onSelect={() => {
                update({ categoryId: null });
                setOpenSheet(null);
              }}
            />
            {categories.map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() => {
                    update({ categoryId: category.id });
                    setOpenSheet(null);
                  }}
                  aria-pressed={category.id === filters.categoryId}
                  className={cn(
                    'pressable-tint rounded-inner flex h-12 w-full items-center gap-3 px-2 text-left text-sm',
                    category.id === filters.categoryId ? 'text-brand-readable bg-brand-subtle' : 'text-text',
                  )}
                >
                  <CategoryIcon icon={category.icon} color={category.color} className="size-8" />
                  {category.name}
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      <Sheet open={openSheet === 'type'} onOpenChange={(open) => !open && setOpenSheet(null)}>
        <SheetContent title="Pilih tipe">
          <ul className="flex flex-col">
            <FilterOption
              label="Semua tipe"
              selected={!filters.type}
              onSelect={() => {
                update({ type: null });
                setOpenSheet(null);
              }}
            />
            {(Object.keys(TYPE_LABEL) as HistoryTransactionType[]).map((type) => (
              <FilterOption
                key={type}
                label={TYPE_LABEL[type]}
                selected={filters.type === type}
                onSelect={() => {
                  update({ type });
                  setOpenSheet(null);
                }}
              />
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      <Sheet open={openSheet === 'date'} onOpenChange={(open) => !open && setOpenSheet(null)}>
        <SheetContent title="Rentang tanggal">
          <DateRangeForm
            from={filters.from}
            to={filters.to}
            onApply={(from, to) => {
              update({ from, to });
              setOpenSheet(null);
            }}
            onClear={() => {
              update({ from: null, to: null });
              setOpenSheet(null);
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface FilterOptionProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
}

function FilterOption({ label, selected, onSelect }: FilterOptionProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          'pressable-tint rounded-inner flex h-12 w-full items-center px-2 text-left text-sm',
          selected ? 'text-brand-readable bg-brand-subtle font-medium' : 'text-text',
        )}
      >
        {label}
      </button>
    </li>
  );
}

interface DateRangeFormProps {
  from: string | null;
  to: string | null;
  onApply: (from: string | null, to: string | null) => void;
  onClear: () => void;
}

function DateRangeForm({ from, to, onApply, onClear }: DateRangeFormProps) {
  const [fromValue, setFromValue] = useState(from ?? '');
  const [toValue, setToValue] = useState(to ?? '');
  const max = todayInputValue();

  return (
    <div className="flex flex-col gap-3">
      <label className="text-text flex flex-col gap-1 text-sm font-medium">
        Dari
        <input
          type="date"
          value={fromValue}
          max={toValue || max}
          onChange={(e) => setFromValue(e.target.value)}
          className="rounded-input border-border bg-surface text-body text-text h-11 border px-3"
        />
      </label>
      <label className="text-text flex flex-col gap-1 text-sm font-medium">
        Sampai
        <input
          type="date"
          value={toValue}
          min={fromValue}
          max={max}
          onChange={(e) => setToValue(e.target.value)}
          className="rounded-input border-border bg-surface text-body text-text h-11 border px-3"
        />
      </label>
      <div className="flex gap-2 pt-2">
        <Button variant="secondary" className="flex-1" onClick={onClear}>
          Reset
        </Button>
        <Button
          className="flex-1"
          disabled={!fromValue && !toValue}
          onClick={() => onApply(fromValue || null, toValue || null)}
        >
          Terapkan
        </Button>
      </div>
    </div>
  );
}
