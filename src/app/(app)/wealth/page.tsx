import { Gem } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/page-header';

// Placeholder — hub kekayaan sungguhan (net worth, aset, hutang) datang di
// task modulnya (docs/02-IA §5). Task 02 hanya butuh cukup untuk menguji
// navigasi ke rute ini.
export default function WealthPage() {
  return (
    <>
      <PageHeader title="Kekayaan" />
      <EmptyState
        icon={Gem}
        title="Belum ada data kekayaan"
        description="Tambahkan dompet, emas, atau deposito untuk mulai melihat kekayaan bersih Anda."
      />
    </>
  );
}
