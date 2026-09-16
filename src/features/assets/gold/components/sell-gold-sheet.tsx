'use client';

/**
 * Sell sheet — weight, price/gram (prefilled from the latest BUYBACK
 * price), destination wallet, then a confirmation dialog showing proceeds
 * + realized gain/loss BEFORE anything is committed — docs/10-ux-states.md
 * §5.1: "Jual emas | Ya | Dialog menampilkan proceeds + realized gain/loss".
 *
 * The preview is computed CLIENT-SIDE via the same pure
 * `computeSale` (src/lib/finance/gold.ts) the server uses — reconstructed
 * from the lot data already on the page (`GoldLotClientData.remainingGramsRaw`
 * / `.purchasePricePerGram`), so the confirmation dialog appears instantly
 * with no extra round trip. This is a UX preview only, never the actual
 * security boundary: `sellGoldAction` → `sellGold` re-validates and
 * re-computes everything server-side, under a real `FOR UPDATE` lock, and
 * is the only thing that actually moves money — same "client shows a
 * courtesy number, server enforces the real one" split as
 * src/features/savings/components/withdraw-sheet.tsx's `available` prop.
 */
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent, Dialog, DialogContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MoneyText } from '@/components/finance/money-text';
import { useToast } from '@/components/ui/toast';
import { WalletPicker } from '@/features/transactions/components/wallet-picker';
import { deserializeMoney, fromRupiah } from '@/lib/finance/money';
import { computeSale, parseGrams, type Grams } from '@/lib/finance/gold';
import { sellGoldAction } from '../actions';
import type { WalletOption } from '@/features/transactions/sheet-data';
import type { GoldLotClientData } from '../client-types';

interface SalePreview {
  proceeds: bigint;
  costBasis: bigint;
  realizedGain: bigint;
}

interface SellGoldSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lots: GoldLotClientData[];
  totalGramsRaw: string;
  totalGramsDisplay: string;
  /** Latest recorded BUYBACK price per gram, whole-rupiah string — `null`
   * when no price has ever been recorded (the sell button is hidden in
   * that case by the parent, but the field still needs a safe default). */
  defaultBuybackPerGram: string | null;
  wallets: WalletOption[];
  defaultWalletId: string | null;
}

export function SellGoldSheet(props: SellGoldSheetProps) {
  const { open, onOpenChange } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent variant="bottom" title="Jual emas">
        {open && <SellGoldSheetForm {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function SellGoldSheetForm({
  onOpenChange,
  lots,
  totalGramsRaw,
  totalGramsDisplay,
  defaultBuybackPerGram,
  wallets,
  defaultWalletId,
}: SellGoldSheetProps) {
  const router = useRouter();
  const toast = useToast();
  const [weightGrams, setWeightGrams] = useState('');
  const [pricePerGram, setPricePerGram] = useState(defaultBuybackPerGram ?? '');
  const [walletId, setWalletId] = useState(defaultWalletId ?? wallets[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<SalePreview | null>(null);
  const [isPending, startTransition] = useTransition();
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const totalAvailable: Grams = parseGrams(totalGramsRaw);

  /** Client-side validation + preview computation — opens the confirm
   * dialog on success. The SAME two checks (`> 0`, `<= totalAvailable`)
   * `sellGold` enforces server-side under a real lock; failing them here
   * first just avoids a round trip for the common case. */
  function handleReview() {
    setError(null);

    let grams: Grams;
    try {
      grams = parseGrams(weightGrams);
    } catch {
      setError('Berat tidak valid');
      return;
    }
    if (grams <= 0n) {
      setError('Berat harus lebih dari 0 gram');
      return;
    }
    if (grams > totalAvailable) {
      setError(`Melebihi kepemilikan emas Anda. Tersedia ${totalGramsDisplay} gram.`);
      return;
    }

    let price: bigint;
    try {
      price = fromRupiah(pricePerGram);
    } catch {
      setError('Harga tidak valid');
      return;
    }
    if (price <= 0n) {
      setError('Harga harus lebih dari Rp0');
      return;
    }
    if (walletId === '') {
      setError('Pilih dompet tujuan');
      return;
    }

    const lotInputs = lots.map((lot) => ({
      id: lot.id,
      remainingGrams: parseGrams(lot.remainingGramsRaw),
      purchasePricePerGram: deserializeMoney(lot.purchasePricePerGram),
    }));
    const sale = computeSale(lotInputs, grams, price);
    setPreview({ proceeds: sale.proceeds, costBasis: sale.costBasis, realizedGain: sale.realizedGain });
    setConfirmOpen(true);
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await sellGoldAction({
        weightGrams,
        pricePerGram,
        walletId,
        saleDate: new Date(),
        idempotencyKey: idempotencyKeyRef.current,
      });
      if (result.error) {
        // Keep the confirm dialog open so the error is actually visible —
        // closing it here would discard the message along with the sheet.
        setError(result.error);
        return;
      }

      setConfirmOpen(false);
      onOpenChange(false);
      router.refresh();
      toast.show({ title: 'Penjualan emas tersimpan', variant: 'success' });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-muted text-center text-sm">Tersedia {totalGramsDisplay} gram</p>

      <Input
        label="Berat (gram)"
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={weightGrams}
        onChange={(e) => setWeightGrams(e.target.value)}
      />
      <Input
        label="Harga buyback per gram (Rp)"
        type="money"
        placeholder="0"
        value={pricePerGram}
        onChange={(e) => setPricePerGram(e.target.value)}
      />
      <WalletPicker wallets={wallets} value={walletId} onChange={setWalletId} triggerLabel="Dompet tujuan" />

      {error && !confirmOpen && (
        <p role="alert" className="text-negative text-center text-sm">
          {error}
        </p>
      )}

      <Button className="w-full" onClick={handleReview}>
        Jual Emas
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent variant="center" title="Konfirmasi penjualan emas">
          {preview && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted text-sm">Hasil penjualan</span>
                  <MoneyText amount={preview.proceeds} tone="plain" size="md" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted text-sm">
                    {preview.realizedGain >= 0n ? 'Keuntungan direalisasi' : 'Kerugian direalisasi'}
                  </span>
                  <MoneyText amount={preview.realizedGain} tone="auto" showSign size="md" />
                </div>
              </div>

              {error && (
                <p role="alert" className="text-negative text-center text-sm">
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setConfirmOpen(false)}
                  disabled={isPending}
                >
                  Batal
                </Button>
                <Button className="flex-1" loading={isPending} onClick={handleConfirm}>
                  Jual
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
