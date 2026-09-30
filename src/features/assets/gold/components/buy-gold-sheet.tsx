'use client';

/**
 * Buy sheet — weight, price/gram (prefilled from the latest SELL price:
 * "harga jual terakhir" is what you'd actually pay to buy more, todo.md),
 * source wallet. No confirmation dialog — docs/10-ux-states.md §5.1's table
 * doesn't list buying gold among actions requiring one (unlike selling).
 *
 * Two plain numeric `Input`s rather than `<AmountKeypad>`: a purchase needs
 * BOTH a weight and a price, which the keypad's single running rupiah
 * expression has no room for. Structurally closest to
 * src/features/savings/components/contribute-sheet.tsx (mounted only while
 * `open`, so a re-opened sheet always gets a fresh `idempotencyKey`), with
 * `WalletPicker` reused as-is for the source wallet.
 */
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { WalletPicker } from '@/features/transactions/components/wallet-picker';
import { buyGoldAction } from '../actions';
import type { WalletOption } from '@/features/transactions/sheet-data';
import type { GoldVendorOption } from '../market-queries';

/** `YYYY-MM-DD` in the browser's local timezone — the `en-CA` locale is a
 * well-known trick for getting that exact format from `Date` formatting
 * instead of hand-rolling a UTC-offset calculation. Matches what
 * `<input type="date">` reads/writes. */
function todayLocalDate(): string {
  return new Date().toLocaleDateString('en-CA');
}

interface BuyGoldSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: WalletOption[];
  defaultWalletId: string | null;
  /** Latest recorded SELL price per gram, as a whole-rupiah string (e.g.
   * `"1250000"`) ready to prefill an `Input type="money"` — `null` when no
   * price has ever been recorded. */
  defaultPricePerGram: string | null;
  /** Vendor names from the daily-refreshed market price table
   * (src/features/assets/gold/market-queries.ts) — empty before the first
   * cron run, in which case the "Penyedia" field is skipped entirely rather
   * than blocking the purchase on it. */
  vendors: GoldVendorOption[];
}

export function BuyGoldSheet(props: BuyGoldSheetProps) {
  const { open, onOpenChange } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent variant="bottom" title="Beli emas">
        {open && <BuyGoldSheetForm {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function BuyGoldSheetForm({
  onOpenChange,
  wallets,
  defaultWalletId,
  defaultPricePerGram,
  vendors,
}: BuyGoldSheetProps) {
  const router = useRouter();
  const toast = useToast();
  const [weightGrams, setWeightGrams] = useState('');
  const [pricePerGram, setPricePerGram] = useState(defaultPricePerGram ?? '');
  const [walletId, setWalletId] = useState(defaultWalletId ?? wallets[0]?.id ?? '');
  const [purchaseDate, setPurchaseDate] = useState(todayLocalDate());
  const [vendorName, setVendorName] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const saveDisabled =
    weightGrams.trim() === '' || pricePerGram.trim() === '' || walletId === '' || purchaseDate === '' || isPending;

  function handleSave() {
    if (saveDisabled) return;
    setError(null);
    startTransition(async () => {
      const result = await buyGoldAction({
        weightGrams,
        pricePerGram,
        walletId,
        // Constructed at UTC midnight so `toDateOnly` (src/lib/services/gold.ts)
        // — which reads the date back out via `toISOString().slice(0, 10)` —
        // round-trips to exactly the date the user picked, regardless of
        // their local timezone offset.
        purchaseDate: new Date(`${purchaseDate}T00:00:00.000Z`),
        goldForm: null,
        vendorName: vendorName === '' ? null : vendorName,
        notes: notes.trim() === '' ? null : notes.trim(),
        idempotencyKey: idempotencyKeyRef.current,
      });
      if (result.error) {
        setError(result.error);
        return;
      }

      onOpenChange(false);
      router.refresh();
      toast.show({ title: 'Pembelian emas tersimpan', variant: 'success' });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Berat (gram)"
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={weightGrams}
        onChange={(e) => setWeightGrams(e.target.value)}
      />
      <Input
        label="Harga beli per gram (Rp)"
        type="money"
        placeholder="0"
        value={pricePerGram}
        onChange={(e) => setPricePerGram(e.target.value)}
      />
      <WalletPicker wallets={wallets} value={walletId} onChange={setWalletId} triggerLabel="Dompet sumber" />

      <label className="flex flex-col gap-1.5">
        <span className="text-text text-sm font-medium">Tanggal beli</span>
        <input
          type="date"
          value={purchaseDate}
          onChange={(e) => setPurchaseDate(e.target.value)}
          className="rounded-input border-border bg-surface text-body text-text h-11 border px-3"
        />
      </label>

      {vendors.length > 0 && (
        <Select
          label="Penyedia"
          placeholder="Pilih penyedia (opsional)"
          options={vendors}
          value={vendorName}
          onValueChange={setVendorName}
        />
      )}

      <Input
        label="Keterangan"
        type="text"
        placeholder="Opsional"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      {error && (
        <p role="alert" className="text-negative text-center text-sm">
          {error}
        </p>
      )}

      <Button className="w-full" loading={isPending} disabled={saveDisabled} onClick={handleSave}>
        Beli Emas
      </Button>
    </div>
  );
}
