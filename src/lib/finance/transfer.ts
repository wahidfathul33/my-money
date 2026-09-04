/**
 * Pure entry-shaping for a self-wallet transfer — docs/03-domain-model.md
 * §9.2, tasks/08-transfers-self/spec.md. No I/O: this only decides WHAT two
 * `postEntries` (src/lib/finance/ledger.ts) inputs a transfer produces, never
 * writes them — same "pure application logic operating on injected data"
 * discipline as ledger.ts itself (docs/11-tech-architecture.md §3).
 *
 * A self-transfer is ONE `transactions` row and TWO `ledger_entries`, both
 * pointing at the same `transactionId` — no `transfer_group_id`, no
 * `transfers` table (spec.md "Jangan"). The source wallet's entry is
 * negative, the destination's is positive, both for the SAME `amount` and
 * the SAME `userId` (a self-transfer never moves money across owners) — so
 * `Σ entry.amount = 0` always holds (invariant I2, counted only when
 * `counterparty_user_id IS NULL`, which self-transfers always are).
 */
import type { PostEntryInput } from './ledger';
import type { Money } from './money';

export interface SelfTransferEntriesInput {
  /** Owner of BOTH wallets — a self-transfer never crosses users. */
  userId: string;
  fromWalletId: string;
  toWalletId: string;
  /** Always positive — the sign is derived here, never taken from input. */
  amount: Money;
  entryDate: Date;
  transactionId: string;
}

/**
 * Builds the two ledger entries for a self-wallet transfer: `fromWalletId`
 * falls by `amount`, `toWalletId` rises by the same `amount`. Returned in
 * `[from, to]` order — callers may rely on that order, but `postEntries`
 * itself doesn't care since it aggregates per-wallet before writing.
 */
export function buildSelfTransferEntries(
  input: SelfTransferEntriesInput,
): [PostEntryInput, PostEntryInput] {
  const { userId, fromWalletId, toWalletId, amount, entryDate, transactionId } = input;

  return [
    {
      userId,
      walletId: fromWalletId,
      amount: -amount,
      source: 'transaction',
      entryDate,
      transactionId,
    },
    {
      userId,
      walletId: toWalletId,
      amount,
      source: 'transaction',
      entryDate,
      transactionId,
    },
  ];
}
