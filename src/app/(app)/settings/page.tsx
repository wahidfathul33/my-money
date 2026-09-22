import { ChevronRight, LogOut, Share2, SlidersHorizontal, Tag } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/lib/auth/actions';

// Placeholder — profil, dompet, data (docs/09 §18) datang di task modulnya
// masing-masing. Kategori (task 06), Yang Saya Bagikan (task 12), dan
// Preferensi (task 18 — hanya "Hitung piutang sebagai aset" untuk saat ini)
// are the real entry points wired up here so far.
//
// "Keluar" moved here from the old dashboard placeholder (task 04) when
// task 20 replaced that page with the real dashboard — this is docs/09
// §18's actual home for it ("Data (ekspor CSV, hapus akun) · Tentang"
// section), and the app needs exactly one durable sign-out affordance
// regardless of which task owns the dashboard's own content at any moment.
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Pengaturan" />
      <nav aria-label="Pengaturan" className="px-page-x">
        <ul className="divide-separator border-border rounded-card divide-y border">
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
        </ul>
      </nav>
      <div className="px-page-x pt-6">
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            <LogOut className="size-4" aria-hidden="true" />
            Keluar
          </Button>
        </form>
      </div>
    </>
  );
}
