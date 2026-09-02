import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';

/**
 * Shell rute terautentikasi (docs/11-tech-architecture.md §2). Task 02
 * hanya membangun chrome navigasi — guard sesi ("penjaga keanggotaan +
 * nav household" untuk `(app)` sendiri) datang di task 04 (autentikasi) dan
 * akan dibungkuskan di sekitar `<AppShell>` ini. Task 04 berjalan paralel
 * di worktree lain dan kemungkinan menyentuh berkas yang sama — lihat
 * laporan task 02 untuk rekonsiliasi.
 */
export default function AuthenticatedLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
