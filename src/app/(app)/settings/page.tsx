import { ChevronRight, CircleUser, Database, Info, Share2, SlidersHorizontal, Tag } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';

// Kategori (task 06), Yang Saya Bagikan (task 12), dan Preferensi (task 18,
// diperluas task 22) sudah ada sebelum task ini. Profil/Data/Tentang
// (docs/09 §18) ditambahkan di sini oleh tasks/22-settings-sharing-pwa —
// baris yang sudah ada di bawah TIDAK direstrukturisasi, hanya ditambahkan
// di sekitarnya. Keluarga dan Dompet sendiri hidup sebagai tujuan navigasi
// utama (bottom nav/sidebar — src/components/layout/nav-items.ts), bukan
// baris di sini, jadi tidak diduplikasi.
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Pengaturan" />
      <nav aria-label="Pengaturan" className="px-page-x">
        <ul className="divide-separator border-border rounded-card divide-y border">
          <li>
            <Link href="/settings/profile" className="list-row flex items-center gap-3 px-4 py-3">
              <span className="bg-surface-raised text-text-muted flex size-10 items-center justify-center rounded-full">
                <CircleUser className="size-5" aria-hidden="true" />
              </span>
              <span className="text-text flex-1 text-sm font-medium">Profil</span>
              <ChevronRight className="text-text-subtle size-4" aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link
              href="/settings/categories"
              className="list-row flex items-center gap-3 px-4 py-3"
            >
              <span className="bg-surface-raised text-text-muted flex size-10 items-center justify-center rounded-full">
                <Tag className="size-5" aria-hidden="true" />
              </span>
              <span className="text-text flex-1 text-sm font-medium">Kategori</span>
              <ChevronRight className="text-text-subtle size-4" aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link href="/settings/sharing" className="list-row flex items-center gap-3 px-4 py-3">
              <span className="bg-surface-raised text-text-muted flex size-10 items-center justify-center rounded-full">
                <Share2 className="size-5" aria-hidden="true" />
              </span>
              <span className="text-text flex-1 text-sm font-medium">Yang Saya Bagikan</span>
              <ChevronRight className="text-text-subtle size-4" aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link href="/settings/preferences" className="list-row flex items-center gap-3 px-4 py-3">
              <span className="bg-surface-raised text-text-muted flex size-10 items-center justify-center rounded-full">
                <SlidersHorizontal className="size-5" aria-hidden="true" />
              </span>
              <span className="text-text flex-1 text-sm font-medium">Preferensi</span>
              <ChevronRight className="text-text-subtle size-4" aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link href="/settings/data" className="list-row flex items-center gap-3 px-4 py-3">
              <span className="bg-surface-raised text-text-muted flex size-10 items-center justify-center rounded-full">
                <Database className="size-5" aria-hidden="true" />
              </span>
              <span className="text-text flex-1 text-sm font-medium">Data</span>
              <ChevronRight className="text-text-subtle size-4" aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link href="/settings/about" className="list-row flex items-center gap-3 px-4 py-3">
              <span className="bg-surface-raised text-text-muted flex size-10 items-center justify-center rounded-full">
                <Info className="size-5" aria-hidden="true" />
              </span>
              <span className="text-text flex-1 text-sm font-medium">Tentang</span>
              <ChevronRight className="text-text-subtle size-4" aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </nav>
    </>
  );
}
