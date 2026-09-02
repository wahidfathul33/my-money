import { Receipt } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/page-header';

// Placeholder — cukup untuk menguji navigasi (tasks/02/todo.md "Halaman
// Placeholder"). Isi sungguhan (riwayat transaksi, filter) datang di task
// modulnya sendiri.
export default function TransactionsPage() {
  return (
    <>
      <PageHeader title="Transaksi" />
      <EmptyState
        icon={Receipt}
        title="Catat transaksi pertama"
        description="Pencatatan harian yang konsisten membuat semua laporan di sini jadi berguna."
      />
    </>
  );
}
