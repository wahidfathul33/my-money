/**
 * Wire-safe wallet shape for crossing the Server → Client Component
 * boundary.
 *
 * React Server Components' flight serialization does not support `bigint`
 * (unlike `Date`/`Map`/`Set`, which it special-cases) — passing a raw
 * `wallets.balance` bigint as a prop into a `'use client'` component throws
 * at render time. `src/lib/finance/money.ts`'s `serializeMoney`/
 * `deserializeMoney` already exist for exactly this class of boundary
 * ("Server Action / route handler boundary" per that file's doc comment) —
 * an RSC prop boundary is the same problem. Every client component in this
 * feature takes `WalletClientData`, never the raw `WalletRow` from
 * src/features/wallets/queries.ts.
 */
import { deserializeMoney, serializeMoney, type Money } from '@/lib/finance/money';
import type { WalletType } from './wallet-type-meta';
import type { WalletRow } from './queries';

export interface WalletClientData {
  id: string;
  name: string;
  type: WalletType;
  balance: string;
  icon: string;
  color: string;
  isArchived: boolean;
  sortOrder: number;
  /** tasks/12-sharing-and-privacy — docs/03-domain-model.md §5.1's per-item
   * escape hatch. Hides this wallet from household wealth (AND from the
   * transfer-target picker, docs §5) even when `share_wealth` is on. */
  excludeFromHousehold: boolean;
}

export function toWalletClientData(wallet: WalletRow): WalletClientData {
  return {
    id: wallet.id,
    name: wallet.name,
    type: wallet.type,
    balance: serializeMoney(wallet.balance),
    icon: wallet.icon,
    color: wallet.color,
    isArchived: wallet.isArchived,
    sortOrder: wallet.sortOrder,
    excludeFromHousehold: wallet.excludeFromHousehold,
  };
}

export function walletBalance(wallet: WalletClientData): Money {
  return deserializeMoney(wallet.balance);
}
