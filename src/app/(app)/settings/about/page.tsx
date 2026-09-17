import { PageHeader } from '@/components/layout/page-header';
import packageJson from '../../../../../package.json';

/**
 * `/settings/about` — docs/09-screen-specs.md §18: "Tentang: versi, tautan
 * docs, catatan lisensi". Static content, no data fetch — a Server
 * Component only because every other `/settings/*` page is one, not
 * because it needs to be.
 */
export default function AboutSettingsPage() {
  return (
    <>
      <PageHeader title="Tentang" />
      <div className="px-page-x flex flex-col gap-4 pb-8">
        <div className="bg-surface rounded-card flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <span className="text-text text-sm font-medium">Versi</span>
            <span className="text-text-muted text-sm">{packageJson.version}</span>
          </div>
          <div className="border-border flex items-center justify-between border-t pt-4">
            <span className="text-text text-sm font-medium">Dokumentasi</span>
            <a
              href="https://github.com/my-money/my-money"
              target="_blank"
              rel="noreferrer"
              className="text-brand-readable text-sm font-medium"
            >
              Buka
            </a>
          </div>
        </div>

        <div className="bg-surface rounded-card p-4">
          <p className="text-text-muted text-xs leading-relaxed">
            MyMoney adalah aplikasi keuangan pribadi. Seluruh data yang Anda masukkan tetap milik
            Anda — lihat halaman Data untuk ekspor atau penghapusan akun. Dibangun dengan Next.js,
            dilisensikan untuk penggunaan pribadi.
          </p>
        </div>
      </div>
    </>
  );
}
