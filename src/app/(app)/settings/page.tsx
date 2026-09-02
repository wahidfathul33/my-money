import { ChevronRight, Tag } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';

// Placeholder — profil, preferensi, sharing, dompet, data (docs/09 §18)
// datang di task modulnya masing-masing. Kategori (task 06) is the first
// real entry point wired up here.
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Pengaturan" />
      <nav aria-label="Pengaturan" className="px-page-x">
        <ul className="divide-separator border-border divide-y rounded-lg border">
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
        </ul>
      </nav>
    </>
  );
}
