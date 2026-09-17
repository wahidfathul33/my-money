'use server';

/**
 * `exportDataAction` — the actual `'use server'` Server Action. Split from
 * `./export-queries.ts` (which holds the CSV-building queries,
 * `ExportRateLimitedError`, and the `ExportResult` type) because a
 * `'use server'` module may only export async functions at runtime — see
 * that file's own header comment for the full reasoning.
 *
 * Owned by this task per spec.md's "Berkas yang Disentuh" list. Task 22
 * (settings/sharing/PWA, running in parallel) is expected to build the
 * `/settings/data` PAGE with the actual "Ekspor CSV" button that imports
 * and calls this action — nothing here depends on how that page ends up
 * structured.
 *
 * "Unduhan lewat blob, bukan disimpan di server" (todo.md) — this action
 * never writes a file anywhere; it returns CSV text in memory, and the
 * calling page is expected to build a `Blob` client-side and trigger a
 * download from it. Nothing here persists past the request.
 */
import { requireUser } from '@/lib/auth/require-user';
import { checkRateLimit } from '@/lib/api/rate-limit';
import {
  EXPORT_RATE_LIMIT,
  ExportRateLimitedError,
  fetchAssetsCsv,
  fetchDebtsCsv,
  fetchReceivablesCsv,
  fetchTransactionsCsv,
  fetchWalletsCsv,
  type ExportResult,
} from './export-queries';

export type { ExportResult };

/**
 * `requireUser()` first, then a fail-closed rate limit (3/hour/user,
 * checked BEFORE any query runs — same ordering as
 * `assertInviteSendRateLimit`), then five independent `ownedBy` reads run in
 * parallel. Returns plain CSV text for every table; the caller decides how
 * to package/download it (see this file's header comment).
 */
export async function exportDataAction(): Promise<ExportResult> {
  const user = await requireUser();

  const { allowed } = checkRateLimit(`export:${user.id}`, EXPORT_RATE_LIMIT);
  if (!allowed) {
    throw new ExportRateLimitedError();
  }

  const [transactionsCsv, walletsCsv, assetsCsv, debtsCsv, receivablesCsv] = await Promise.all([
    fetchTransactionsCsv(user.id),
    fetchWalletsCsv(user.id),
    fetchAssetsCsv(user.id),
    fetchDebtsCsv(user.id),
    fetchReceivablesCsv(user.id),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    transactions: transactionsCsv,
    wallets: walletsCsv,
    assets: assetsCsv,
    debts: debtsCsv,
    receivables: receivablesCsv,
  };
}
