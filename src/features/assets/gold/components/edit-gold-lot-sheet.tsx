'use client';

/**
 * Edit sheet for one "Kepemilikan" lot — structural copy of
 * `buy-gold-sheet.tsx` minus the `WalletPicker` (the purchase stays tied to
 * its original wallet — reassigning which wallet paid for it is a separate,
 * unrequested feature) and minus a gold-form field (`buy-gold-sheet.tsx`
 * itself never exposes one either, hardcoding `goldForm: null` on create).
 *
 * Only reachable for a lot where `GoldLotClientData.canEdit` is `true` — see
 * src/lib/services/gold.ts's `assertLotUntouchedBySale` for why a
 * partially/fully-sold lot can't be edited.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { deserializeMoney } from '@/lib/finance/money';
import { updateGoldLotAction } from '../actions';
import type { GoldVendorOption } from '../market-queries';
import type { GoldLotClientData } from '../client-types';

interface EditGoldLotSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lot: GoldLotClientData | null;
  vendors: GoldVendorOption[];
}

export function EditGoldLotSheet({ open, onOpenChange, lot, vendors }: EditGoldLotSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent variant="bottom" title="Ubah kepemilikan emas">
        {open && lot && <EditGoldLotSheetForm onOpenChange={onOpenChange} lot={lot} vendors={vendors} />}
      </SheetContent>
    </Sheet>
  );
}

function EditGoldLotSheetForm({
  onOpenChange,
  lot,
  vendors,
}: {
  onOpenChange: (open: boolean) => void;
  lot: GoldLotClientData;
  vendors: GoldVendorOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [weightGrams, setWeightGrams] = useState(lot.weightGramsRaw);
  const [pricePerGram, setPricePerGram] = useState((deserializeMoney(lot.purchasePricePerGram) / 100n).toString());
  const [purchaseDate, setPurchaseDate] = useState(lot.purchaseDate);
  const [vendorName, setVendorName] = useState(lot.vendorName ?? '');
  const [notes, setNotes] = useState(lot.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const saveDisabled =
    weightGrams.trim() === '' || pricePerGram.trim() === '' || purchaseDate === '' || isPending;

  function handleSave() {
    if (saveDisabled) return;
    setError(null);
    startTransition(async () => {
      const result = await updateGoldLotAction({
        lotId: lot.id,
        weightGrams,
        pricePerGram,
        // Same UTC-midnight construction as buy-gold-sheet.tsx, for the same
        // `toDateOnly` round-trip reason.
        purchaseDate: new Date(`${purchaseDate}T00:00:00.000Z`),
        vendorName: vendorName === '' ? null : vendorName,
        notes: notes.trim() === '' ? null : notes.trim(),
      });
      if (result.error) {
        setError(result.error);
        return;
      }

      onOpenChange(false);
      router.refresh();
      toast.show({ title: 'Kepemilikan emas diperbarui', variant: 'success' });
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
        Simpan Perubahan
      </Button>
    </div>
  );
}
