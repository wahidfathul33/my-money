'use client';

/**
 * Create/edit sheet — bank, pokok, suku bunga, tanggal, jadwal, ARO, dompet
 * sumber (todo.md). `principal`/`startDate`/`walletId` are CREATE-ONLY
 * fields, omitted entirely in edit mode — src/lib/services/deposits.ts's
 * `UpdateDepositInput` doesn't even accept them, the same "locked after
 * creation" treatment src/features/wallets/components/wallet-form-sheet.tsx
 * gives `type` and src/features/savings/components/goal-form-sheet.tsx
 * gives `householdId`.
 *
 * `tax_rate` has NO field here at all — it's derived server-side from
 * `principal` via `shouldApplyTax` (src/lib/finance/deposit.ts) and shown
 * as read-only explanatory text, never user-editable (todo.md: "tax_rate
 * otomatis 0 bila pokok ≤ Rp7,5 juta, dengan penjelasan").
 *
 * The inner form only mounts while `open` is true — same technique as
 * src/features/savings/components/contribute-sheet.tsx, for the same
 * reason: create mode's `idempotencyKey` must be FRESH every time the
 * sheet re-opens, never carried over from a previous (possibly already
 * submitted) attempt.
 */
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import type { WalletOption } from '@/features/transactions/sheet-data';
import { shouldApplyTax } from '@/lib/finance/deposit';
import { fromRupiah } from '@/lib/finance/money';
import { createDepositAction, updateDepositAction, type ActionState } from '../actions';
import type { DepositDetailClientData } from '../client-types';

const initialState: ActionState = { error: null };
const NO_WALLET_VALUE = '';
const PAYOUT_SCHEDULE_OPTIONS = [
  { value: 'at_maturity', label: 'Saat jatuh tempo' },
  { value: 'monthly', label: 'Bulanan' },
];

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full">
      {label}
    </Button>
  );
}

interface DepositFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present => edit mode. Absent => create mode. */
  deposit?: DepositDetailClientData;
  wallets: WalletOption[];
  /** The caller's account-level default wallet (create mode's initial
   * source-wallet selection) — same `resolveDefaultWalletId` prop shape as
   * src/features/savings/components/contribute-sheet.tsx. `null` when the
   * account has none, or no active wallets exist at all. */
  defaultWalletId?: string | null;
  onSuccess?: (depositId: string) => void;
}

export function DepositFormSheet(props: DepositFormSheetProps) {
  const { open, onOpenChange, deposit } = props;
  const isEdit = Boolean(deposit);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        variant="bottom"
        title={isEdit ? 'Ubah deposito' : 'Deposito baru'}
        description={isEdit ? undefined : 'Bunga ditampilkan sebagai estimasi setelah pajak — bukan uang yang sudah Anda miliki sampai cair.'}
      >
        {open && <DepositFormSheetForm {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function DepositFormSheetForm({ onOpenChange, deposit, wallets, defaultWalletId, onSuccess }: DepositFormSheetProps) {
  const isEdit = Boolean(deposit);
  const action = isEdit ? updateDepositAction : createDepositAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const [principalInput, setPrincipalInput] = useState(deposit ? (BigInt(deposit.principal) / 100n).toString() : '');
  const [payoutSchedule, setPayoutSchedule] = useState(deposit?.payoutSchedule ?? 'at_maturity');
  const [aroEnabled, setAroEnabled] = useState(deposit?.aroEnabled ?? false);
  const [aroIncludeInterest, setAroIncludeInterest] = useState(deposit?.aroIncludeInterest ?? false);
  const [walletId, setWalletId] = useState(deposit?.walletId ?? defaultWalletId ?? wallets[0]?.id ?? NO_WALLET_VALUE);

  const wasPending = useRef(isPending);
  useEffect(() => {
    if (wasPending.current && !isPending && state.error === null) {
      onOpenChange(false);
      if (state.depositId) onSuccess?.(state.depositId);
    }
    wasPending.current = isPending;
  }, [isPending, state.error, state.depositId, onOpenChange, onSuccess]);

  const taxNote = useMemo(() => {
    let principal = 0n;
    try {
      principal = fromRupiah(principalInput || '0');
    } catch {
      // Ignore — an unparsable amount just shows the exempt note until corrected.
    }
    return shouldApplyTax(principal)
      ? 'PPh final 20% berlaku (pokok di atas Rp7.500.000).'
      : 'Bebas PPh — pokok di angka atau di bawah Rp7.500.000.';
  }, [principalInput]);

  const walletOptions = [
    { value: NO_WALLET_VALUE, label: 'Tidak ada — catat saja' },
    ...wallets.map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <form action={formAction} className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto overscroll-contain pb-1">
      {isEdit && <input type="hidden" name="depositId" value={deposit!.id} />}
      {!isEdit && <input type="hidden" name="idempotencyKey" value={idempotencyKeyRef.current} />}
      <input type="hidden" name="payoutSchedule" value={payoutSchedule} />
      <input type="hidden" name="aroEnabled" value={String(aroEnabled)} />
      <input type="hidden" name="aroIncludeInterest" value={String(aroEnabled && aroIncludeInterest)} />
      {!isEdit && <input type="hidden" name="walletId" value={walletId} />}

      <Input label="Nama bank" name="bankName" defaultValue={deposit?.bankName} required maxLength={80} />

      {!isEdit && (
        <>
          <Input
            label="Pokok (Rp)"
            name="principal"
            type="money"
            value={principalInput}
            onChange={(e) => setPrincipalInput(e.target.value)}
            required
          />
          <p className="text-text-muted -mt-2 text-xs">{taxNote}</p>
        </>
      )}

      <Input
        label="Suku bunga (% per tahun)"
        name="interestRateAnnual"
        type="text"
        inputMode="decimal"
        defaultValue={deposit?.interestRateAnnual ? Number(deposit.interestRateAnnual).toString() : ''}
        placeholder="4.25"
        required
      />

      {!isEdit && (
        <label className="flex flex-col gap-1.5">
          <span className="text-text text-sm font-medium">Tanggal mulai</span>
          <input
            type="date"
            name="startDate"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
            className="rounded-input border-border bg-surface text-body text-text h-11 border px-3"
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-text text-sm font-medium">Tanggal jatuh tempo</span>
        <input
          type="date"
          name="maturityDate"
          defaultValue={deposit?.maturityDate}
          required
          className="rounded-input border-border bg-surface text-body text-text h-11 border px-3"
        />
      </label>

      <Select label="Jadwal pembayaran bunga" options={PAYOUT_SCHEDULE_OPTIONS} value={payoutSchedule} onValueChange={(v) => setPayoutSchedule(v as 'at_maturity' | 'monthly')} />

      {!isEdit && (
        <Select
          label="Dompet sumber"
          options={walletOptions}
          value={walletId}
          onValueChange={setWalletId}
          placeholder="Pilih dompet"
        />
      )}
      {!isEdit && payoutSchedule === 'monthly' && walletId === NO_WALLET_VALUE && (
        <p className="text-negative text-xs">Jadwal bulanan memerlukan dompet tujuan bunga.</p>
      )}
      {isEdit && (
        <p className="text-text-muted text-sm">
          Pokok dan dompet sumber terkunci setelah dibuat.
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-text text-sm font-medium">Perpanjang otomatis (ARO)</span>
        <Switch label="Perpanjang otomatis (ARO)" checked={aroEnabled} onCheckedChange={setAroEnabled} />
      </div>

      {aroEnabled && (
        <div className="flex items-center justify-between pl-4">
          <span className="text-text-muted text-sm">Sertakan bunga saat diperpanjang</span>
          <Switch label="Sertakan bunga saat diperpanjang" checked={aroIncludeInterest} onCheckedChange={setAroIncludeInterest} />
        </div>
      )}

      {state.error && (
        <p role="alert" className="text-negative text-sm">
          {state.error}
        </p>
      )}

      <SubmitButton label={isEdit ? 'Simpan perubahan' : 'Buat deposito'} />
    </form>
  );
}
