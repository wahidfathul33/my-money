/**
 * Composite server-side fetch for the Add Transaction sheet — bundles
 * active wallets, the resolved default wallet, and both types' quick-pick +
 * full category lists into one shape both `<BottomNav>` (mobile FAB) and
 * `<Sidebar>` (desktop "+ Tambah") pass straight through to
 * `<AddTransactionSheet>`, fetched ONCE per layout render
 * (src/app/(app)/layout.tsx) so the sheet opens with everything already in
 * hand — no loading state between the FAB tap and a usable keypad
 * (tasks/07-transactions-core/spec.md "Tidak ada tap tambahan").
 *
 * `wallets.balance` (a `bigint`) never appears here — RSC's flight
 * serialization can't carry `bigint` across the Server → Client Component
 * boundary (src/features/wallets/client-types.ts explains this at length),
 * and the sheet doesn't need it: the wallet picker shows name/icon only,
 * matching docs/09 §2's wireframe.
 */
import { and, asc, eq } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import {
  getQuickCategories,
  listCategories,
  resolveDefaultWalletId,
  type CategoryRow,
  type CategoryWithChildren,
} from './queries';

export interface WalletOption {
  id: string;
  name: string;
  type: 'cash' | 'bank' | 'ewallet' | 'credit_card';
  icon: string;
  color: string;
}

export interface AddTransactionSheetData {
  wallets: WalletOption[];
  defaultWalletId: string | null;
  quickCategories: { expense: CategoryRow[]; income: CategoryRow[] };
  fullCategories: { expense: CategoryWithChildren[]; income: CategoryWithChildren[] };
}

async function listWalletOptions(userId: string): Promise<WalletOption[]> {
  return dbRead
    .select({
      id: wallets.id,
      name: wallets.name,
      type: wallets.type,
      icon: wallets.icon,
      color: wallets.color,
    })
    .from(wallets)
    .where(and(ownedBy(wallets, userId), eq(wallets.isArchived, false)))
    .orderBy(asc(wallets.type), asc(wallets.sortOrder));
}

export async function getAddTransactionSheetData(userId: string): Promise<AddTransactionSheetData> {
  const [walletOptions, defaultWalletId, quickExpense, quickIncome, fullExpense, fullIncome] =
    await Promise.all([
      listWalletOptions(userId),
      resolveDefaultWalletId(userId),
      getQuickCategories(userId, 'expense'),
      getQuickCategories(userId, 'income'),
      listCategories(userId, 'expense'),
      listCategories(userId, 'income'),
    ]);

  return {
    wallets: walletOptions,
    defaultWalletId,
    quickCategories: { expense: quickExpense, income: quickIncome },
    fullCategories: { expense: fullExpense, income: fullIncome },
  };
}
