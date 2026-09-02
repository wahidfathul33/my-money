import { Receipt } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { getRecentTransactions } from '@/features/transactions/queries';
import { toTransactionClientData } from '@/features/transactions/client-types';
import { getAddTransactionSheetData } from '@/features/transactions/sheet-data';
import { TransactionList } from '@/features/transactions/components/transaction-list';

/**
 * `/transactions` — a minimal real list (task 07's own acceptance criteria
 * need a place for "tap → detail sheet with Edit/Hapus" and "swipe left →
 * quick delete" to live, docs/09 §3). Day-grouping, the period picker,
 * filter chips, and search are explicitly task 09-transaction-history's
 * scope (tasks/07 spec.md "Tidak termasuk: riwayat & filter") — this page
 * is deliberately NOT that yet.
 */
export default async function TransactionsPage() {
  const user = await requireUser();
  const [transactions, sheetData] = await Promise.all([
    getRecentTransactions(user.id),
    getAddTransactionSheetData(user.id),
  ]);

  return (
    <>
      <PageHeader title="Transaksi" />
      {transactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Belum ada transaksi"
          description="Catat pemasukan atau pengeluaran pertama Anda."
        />
      ) : (
        <TransactionList
          transactions={transactions.map(toTransactionClientData)}
          sheetData={sheetData}
        />
      )}
    </>
  );
}
