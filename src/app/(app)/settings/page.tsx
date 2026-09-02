import { Settings } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

// Placeholder — kategori, profil, sharing, data (docs/02-IA §1) datang di
// task modulnya masing-masing.
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Pengaturan" />
      <div className="text-text-muted flex flex-col items-center gap-3 px-6 py-12 text-center text-sm">
        <Settings className="text-text-subtle size-8" aria-hidden="true" />
        Pengaturan akun, kategori, dan berbagi datang di task berikutnya.
      </div>
    </>
  );
}
