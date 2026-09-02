import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * Header judul halaman dasar — dipakai halaman placeholder task ini.
 * Bukan sticky/berkaca: ia bukan elemen mengambang (docs/07 §3.1), jadi
 * tidak ikut anggaran 2 `backdrop-filter`. Context switcher (task 10) dan
 * header sticky per-modul menyusul di task-task berikutnya.
 */
export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="px-page-x flex items-start justify-between gap-4 pt-8 pb-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-title text-text font-semibold">{title}</h1>
        {description && <p className="text-text-muted text-sm">{description}</p>}
      </div>
      {action}
    </header>
  );
}
