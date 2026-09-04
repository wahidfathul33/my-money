'use client';

/**
 * "Pick a member, then pick their wallet" — docs/09-screen-specs.md §2's
 * wireframe: "👤 Istri › 🏦 BRI Istri". Two-step Sheet, same
 * trigger-button-opens-a-list shape as
 * src/features/transactions/components/wallet-picker.tsx, with a person
 * step ahead of the wallet step.
 *
 * `people` (src/features/transfers/target-queries.ts) already carries NO
 * balance anywhere in its shape — each wallet is a `TransferTargetDto`
 * (src/lib/visibility/transfer-targets.ts), which structurally cannot have
 * one (see that module's type-level test).
 */
import { useState } from 'react';
import { ChevronRight, User } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Icon } from '@/lib/icons';
import { MemberAvatar } from '@/features/household/components/member-avatar';
import { WALLET_TYPE_META } from '@/features/wallets/wallet-type-meta';
import type { TransferTargetPerson } from '../target-queries';

export interface MemberTransferSelection {
  counterpartyUserId: string;
  householdId: string;
  toWalletId: string;
}

interface TransferTargetPickerProps {
  people: TransferTargetPerson[];
  value: MemberTransferSelection | null;
  onChange: (selection: MemberTransferSelection) => void;
}

export function TransferTargetPicker({ people, value, onChange }: TransferTargetPickerProps) {
  const [open, setOpen] = useState(false);
  const [pendingPersonId, setPendingPersonId] = useState<string | null>(null);

  const selectedPerson = people.find((p) => p.userId === value?.counterpartyUserId) ?? null;
  const selectedWallet = selectedPerson?.wallets.find((w) => w.id === value?.toWalletId) ?? null;
  const pendingPerson = people.find((p) => p.userId === pendingPersonId) ?? null;

  function openPicker() {
    setPendingPersonId(null);
    setOpen(true);
  }

  function selectWallet(walletId: string) {
    if (!pendingPerson) return;
    onChange({ counterpartyUserId: pendingPerson.userId, householdId: pendingPerson.householdId, toWalletId: walletId });
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        aria-label={`Dompet tujuan: ${selectedPerson ? `${selectedPerson.name ?? selectedPerson.email} — ${selectedWallet?.name ?? 'pilih rekening'}` : 'pilih anggota'}`}
        className="pressable-tint rounded-inner text-text flex h-11 min-w-0 items-center gap-1.5 px-2 text-sm font-medium"
      >
        {selectedPerson ? (
          <>
            <MemberAvatar seed={selectedPerson.userId} name={selectedPerson.name ?? selectedPerson.email} size={20} />
            <span className="min-w-0 truncate">{selectedWallet?.name ?? (selectedPerson.name ?? selectedPerson.email)}</span>
          </>
        ) : (
          <>
            <User className="text-text-muted size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Pilih anggota</span>
          </>
        )}
      </button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setPendingPersonId(null);
        }}
      >
        <SheetContent title={pendingPerson ? `Rekening ${pendingPerson.name ?? pendingPerson.email}` : 'Pilih anggota'}>
          {!pendingPerson ? (
            people.length === 0 ? (
              <p className="text-text-muted py-8 text-center text-sm">Belum ada anggota lain di keluarga Anda.</p>
            ) : (
              <ul className="flex flex-col">
                {people.map((person) => (
                  <li key={person.userId}>
                    <button
                      type="button"
                      onClick={() => setPendingPersonId(person.userId)}
                      className="pressable-tint rounded-inner flex h-14 w-full items-center gap-3 px-2 text-left"
                    >
                      <MemberAvatar seed={person.userId} name={person.name ?? person.email} />
                      <div className="min-w-0 flex-1">
                        <p className="text-text truncate text-sm font-medium">{person.name ?? person.email}</p>
                        {person.wallets.length === 0 && (
                          <p className="text-text-muted truncate text-xs">Belum ada rekening yang dapat dituju</p>
                        )}
                      </div>
                      <ChevronRight className="text-text-muted size-4 shrink-0" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : pendingPerson.wallets.length === 0 ? (
            // spec.md: "Empty state bila anggota belum punya rekening yang dapat dituju."
            <p className="text-text-muted py-8 text-center text-sm">
              {pendingPerson.name ?? pendingPerson.email} belum punya rekening yang dapat dituju.
            </p>
          ) : (
            <ul className="flex flex-col">
              {pendingPerson.wallets.map((wallet) => (
                <li key={wallet.id}>
                  <button
                    type="button"
                    onClick={() => selectWallet(wallet.id)}
                    aria-pressed={wallet.id === value?.toWalletId}
                    // Explicit label (not the default concatenated-text
                    // computation) — for a wallet whose type label happens
                    // to equal its name (e.g. a "Tunai" cash wallet), the
                    // default would announce "Tunai Tunai".
                    aria-label={`${wallet.name}, ${WALLET_TYPE_META[wallet.type].label}`}
                    className="pressable-tint rounded-inner text-text flex h-14 w-full items-center gap-3 px-2 text-left"
                  >
                    <Icon name={wallet.icon} className="size-5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      {/* spec.md "Pemilih rekening menampilkan nama + jenis
                          saja" — name AND type, nothing else (no balance,
                          ever — TransferTargetDto structurally can't carry
                          one). */}
                      <p className="truncate text-sm font-medium">{wallet.name}</p>
                      <p className="text-text-muted truncate text-xs">{WALLET_TYPE_META[wallet.type].label}</p>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
