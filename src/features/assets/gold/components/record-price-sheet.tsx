'use client';

/**
 * Manual price-update sheet — sell & buyback per gram, always for TODAY's
 * date. `recordGoldPriceAction` → `recordGoldPrice` upserts one row per
 * (user, date) (`gold_prices_user_date_uniq`), so re-opening this sheet
 * later the SAME day and saving again overwrites rather than duplicates —
 * todo.md's "Update harga manual mencatat riwayat; satu baris per user per
 * tanggal."
 *
 * This is the ONE entry point both the empty-valuation CTA ("Masukkan
 * harga saat ini") and the ordinary "Ubah" button open — same sheet either
 * way, just a different trigger label upstream.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { recordGoldPriceAction } from '../actions';

interface RecordPriceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whole-rupiah string prefills, from the latest recorded price — `null`
   * the very first time. */
  defaultSellPerGram: string | null;
  defaultBuybackPerGram: string | null;
}

export function RecordPriceSheet(props: RecordPriceSheetProps) {
  const { open, onOpenChange } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        variant="bottom"
        title="Perbarui harga emas"
        description="Harga per gram hari ini, dari sumber Anda sendiri (mis. Antam, Pegadaian, atau toko langganan)."
      >
        {open && <RecordPriceSheetForm {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function RecordPriceSheetForm({
  onOpenChange,
  defaultSellPerGram,
  defaultBuybackPerGram,
}: RecordPriceSheetProps) {
  const router = useRouter();
  const toast = useToast();
  const [sellPerGram, setSellPerGram] = useState(defaultSellPerGram ?? '');
  const [buybackPerGram, setBuybackPerGram] = useState(defaultBuybackPerGram ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const saveDisabled = sellPerGram.trim() === '' || buybackPerGram.trim() === '' || isPending;

  function handleSave() {
    if (saveDisabled) return;
    setError(null);
    startTransition(async () => {
      const today = new Date().toISOString().slice(0, 10);
      const result = await recordGoldPriceAction({ priceDate: today, sellPerGram, buybackPerGram });
      if (result.error) {
        setError(result.error);
        return;
      }

      onOpenChange(false);
      router.refresh();
      toast.show({ title: 'Harga emas diperbarui', variant: 'success' });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Harga jual per gram (Rp)"
        type="money"
        placeholder="0"
        value={sellPerGram}
        onChange={(e) => setSellPerGram(e.target.value)}
      />
      <Input
        label="Harga buyback per gram (Rp)"
        type="money"
        placeholder="0"
        value={buybackPerGram}
        onChange={(e) => setBuybackPerGram(e.target.value)}
      />

      {error && (
        <p role="alert" className="text-negative text-center text-sm">
          {error}
        </p>
      )}

      <Button className="w-full" loading={isPending} disabled={saveDisabled} onClick={handleSave}>
        Simpan Harga
      </Button>
    </div>
  );
}
