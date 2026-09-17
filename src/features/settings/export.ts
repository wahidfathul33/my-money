'use server';

/**
 * PLACEHOLDER — this file is task 21 (reports)'s to own, per
 * tasks/21-reports/spec.md "Berkas yang Disentuh":
 * `src/features/settings/export.ts`. Task 21 runs in a separate worktree in
 * parallel with this one (tasks/22-settings-sharing-pwa) and owns the REAL
 * `exportDataAction` — the actual CSV query/formatting/rate-limiting logic
 * (transactions, wallets, assets, debts — "hanya data milik user sendiri",
 * "Rate limit ekspor: 3/jam per user").
 *
 * This task's job is the `/settings/data` PAGE
 * (src/app/(app)/settings/data/page.tsx) with a button that calls into
 * THIS function — not the export logic itself. Stubbed here only so this
 * branch's own `npm run build`/`typecheck`/`test:e2e` stay green in
 * isolation; task 21's real implementation is expected to REPLACE this
 * file entirely on merge (a real conflict on this exact path, called out
 * explicitly in this task's own instructions as expected, not something to
 * avoid).
 */
import { requireUser } from '@/lib/auth/require-user';

export interface ExportDataResult {
  error: string | null;
  /** CSV file contents, present only on success. */
  csv?: string;
  filename?: string;
}

export async function exportDataAction(): Promise<ExportDataResult> {
  await requireUser();
  return { error: 'Ekspor belum tersedia. Coba lagi nanti.' };
}
