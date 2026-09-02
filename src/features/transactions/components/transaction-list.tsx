'use client';

/**
 * Client wrapper for `/transactions` — a minimal, flat, reverse-chronological
 * list (no day-grouping, period picker, filters, or search: those belong to
 * task 09-transaction-history). This task's own acceptance criteria still
 * need SOME real list to hang "tap → detail sheet with Edit/Hapus" and
 * "swipe left → quick delete" off of (docs/09 §3, tasks/07 todo.md "Edit &
 * Void"), so this exists to host exactly that, and nothing more.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import type { TransactionClientData } from '../client-types';
import { unvoidTransactionAction, voidTransactionAction } from '../actions';
import type { AddTransactionSheetData } from '../sheet-data';
import { EditTransactionSheet } from './edit-transaction-sheet';
import { TransactionDetailSheet } from './transaction-detail-sheet';
import { TransactionRow } from './transaction-row';

interface TransactionListProps {
  transactions: TransactionClientData[];
  sheetData: AddTransactionSheetData;
}

export function TransactionList({ transactions, sheetData }: TransactionListProps) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<TransactionClientData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  function openDetail(transaction: TransactionClientData) {
    setSelected(transaction);
    setDetailOpen(true);
  }

  function quickDelete(transaction: TransactionClientData) {
    startTransition(async () => {
      const result = await voidTransactionAction(transaction.id);
      if (result.error) return;

      router.refresh();
      toast.show({
        title: 'Transaksi dihapus',
        variant: 'success',
        action: {
          label: 'Urungkan',
          onClick: () => {
            startTransition(async () => {
              await unvoidTransactionAction(transaction.id);
              router.refresh();
            });
          },
        },
      });
    });
  }

  return (
    <>
      <ul className="divide-border flex flex-col divide-y">
        {transactions.map((transaction) => (
          <li key={transaction.id}>
            <TransactionRow
              transaction={transaction}
              onOpenDetail={() => openDetail(transaction)}
              onQuickDelete={() => quickDelete(transaction)}
            />
          </li>
        ))}
      </ul>

      <TransactionDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        transaction={selected}
        onEdit={() => {
          setDetailOpen(false);
          setEditOpen(true);
        }}
      />
      <EditTransactionSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        transaction={selected}
        sheetData={sheetData}
        onSaved={() => {}}
      />
    </>
  );
}
