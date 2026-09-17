/**
 * CSV data export — read/formatting logic. Split out of `./export.ts`
 * (the actual `'use server'` action) purely because a `'use server'` module
 * may only export async functions at runtime (every other `actions.ts` in
 * this codebase only ever exports interfaces + async functions — see e.g.
 * src/features/wallets/actions.ts) — a plain class like
 * `ExportRateLimitedError` or a helper function can't live there. Callers
 * that need `instanceof ExportRateLimitedError` (tests, or a future
 * settings page) import it from HERE, not from `./export.ts`.
 *
 * tasks/21-reports/spec.md's Ekspor CSV section: "Data finansial adalah
 * hasil kerja pengguna mencatat bertahun-tahun. Tidak bisa mengeluarkannya
 * adalah masalah kepercayaan." Exports ONLY the caller's OWN rows —
 * transactions, wallets, assets, debts, receivables — never another
 * household member's data even though some of it may be VISIBLE to the
 * caller via sharing (docs/12-security-and-auth.md's two visibility
 * mechanisms, src/lib/visibility/**). Every query below is `ownedBy(table,
 * user.id)` with no join that could pull in anyone else's row — there is no
 * household-scoped variant of any of these, deliberately.
 */
import { and, asc } from 'drizzle-orm';
import { AppError } from '@/lib/api/errors';
import { dbRead } from '@/lib/db/read';
import { assets, categories, debts, receivables, transactions, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import { MINOR_UNITS, type Money } from '@/lib/finance/money';

export const EXPORT_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 3 };

/** docs/12-security-and-auth.md §7: "fail closed untuk login, undangan, dan
 * ekspor" — export is explicitly named alongside login/invitations as a
 * fail-closed limit, same shape as src/lib/auth/invitation-rate-limit.ts. */
export class ExportRateLimitedError extends AppError {
  constructor(message = 'Terlalu banyak ekspor. Coba lagi dalam 1 jam.') {
    super(message);
  }
}

/** `amount` (minor units) → a plain decimal string ("150000.00" /
 * "-50000.00") — spec.md/todo.md: "nominal sebagai angka desimal", NOT
 * `formatIDR`'s "Rp150.000" (thousands separator, currency prefix) — this
 * is for re-import/spreadsheet use, where a locale-formatted string with a
 * "Rp" prefix would have to be un-parsed by whatever reads it back. Kept
 * local to this feature rather than added to src/lib/finance/money.ts: it's
 * a CSV-serialization concern, not a general money-formatting one —
 * `formatIDR`/`serializeMoney` already cover the two audiences (display,
 * and typed bigint round-tripping) that module exists for. */
export function moneyToDecimalString(amount: Money): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / MINOR_UNITS;
  const frac = (abs % MINOR_UNITS).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

/** RFC 4180-ish CSV field escaping: wrap in quotes and double any embedded
 * quote whenever the field contains a comma, quote, or newline — otherwise
 * left bare, so most numeric/date cells stay clean and readable unquoted. */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvField).join(','));
  return lines.join('\n');
}

// --- Row fetchers — every one of these is ownedBy(table, user.id), nothing else. ---

const TRANSACTION_HEADERS = ['ID', 'Tanggal', 'Tipe', 'Kategori', 'Nominal', 'Catatan', 'Dibatalkan'];

export async function fetchTransactionsCsv(userId: string): Promise<string> {
  const rows = await dbRead
    .select({
      id: transactions.id,
      transactionDate: transactions.transactionDate,
      type: transactions.type,
      categoryName: categories.name,
      amount: transactions.amount,
      note: transactions.note,
      voidedAt: transactions.voidedAt,
    })
    .from(transactions)
    .leftJoin(categories, and(ownedBy(categories, userId)))
    .where(ownedBy(transactions, userId))
    .orderBy(asc(transactions.transactionDate));

  return toCsv(
    TRANSACTION_HEADERS,
    rows.map((r) => [
      r.id,
      r.transactionDate.toISOString(),
      r.type,
      r.categoryName ?? '',
      moneyToDecimalString(r.amount),
      r.note ?? '',
      r.voidedAt ? 'Ya' : 'Tidak',
    ]),
  );
}

const WALLET_HEADERS = ['ID', 'Nama', 'Tipe', 'Saldo', 'Mata Uang', 'Diarsipkan'];

export async function fetchWalletsCsv(userId: string): Promise<string> {
  const rows = await dbRead
    .select({
      id: wallets.id,
      name: wallets.name,
      type: wallets.type,
      balance: wallets.balance,
      currency: wallets.currency,
      isArchived: wallets.isArchived,
    })
    .from(wallets)
    .where(ownedBy(wallets, userId))
    .orderBy(asc(wallets.sortOrder));

  return toCsv(
    WALLET_HEADERS,
    rows.map((r) => [r.id, r.name, r.type, moneyToDecimalString(r.balance), r.currency, r.isArchived ? 'Ya' : 'Tidak']),
  );
}

const ASSET_HEADERS = ['ID', 'Nama', 'Jenis', 'Status', 'Nilai', 'Diperbarui'];

export async function fetchAssetsCsv(userId: string): Promise<string> {
  const rows = await dbRead
    .select({
      id: assets.id,
      name: assets.name,
      assetType: assets.assetType,
      status: assets.status,
      cachedValue: assets.cachedValue,
      cachedAt: assets.cachedAt,
    })
    .from(assets)
    .where(ownedBy(assets, userId))
    .orderBy(asc(assets.createdAt));

  return toCsv(
    ASSET_HEADERS,
    rows.map((r) => [
      r.id,
      r.name,
      r.assetType,
      r.status,
      moneyToDecimalString(r.cachedValue),
      r.cachedAt ? r.cachedAt.toISOString() : '',
    ]),
  );
}

const DEBT_HEADERS = ['ID', 'Nama Kreditur', 'Nominal Awal', 'Sisa', 'Status', 'Tanggal Mulai', 'Jatuh Tempo'];

export async function fetchDebtsCsv(userId: string): Promise<string> {
  const rows = await dbRead
    .select({
      id: debts.id,
      creditorName: debts.creditorName,
      initialAmount: debts.initialAmount,
      remainingAmount: debts.remainingAmount,
      status: debts.status,
      startDate: debts.startDate,
      dueDate: debts.dueDate,
    })
    .from(debts)
    .where(ownedBy(debts, userId))
    .orderBy(asc(debts.startDate));

  return toCsv(
    DEBT_HEADERS,
    rows.map((r) => [
      r.id,
      r.creditorName,
      moneyToDecimalString(r.initialAmount),
      moneyToDecimalString(r.remainingAmount),
      r.status,
      r.startDate,
      r.dueDate ?? '',
    ]),
  );
}

const RECEIVABLE_HEADERS = ['ID', 'Nama Debitur', 'Nominal Awal', 'Sisa', 'Status', 'Tanggal Mulai', 'Jatuh Tempo'];

export async function fetchReceivablesCsv(userId: string): Promise<string> {
  const rows = await dbRead
    .select({
      id: receivables.id,
      debtorName: receivables.debtorName,
      initialAmount: receivables.initialAmount,
      remainingAmount: receivables.remainingAmount,
      status: receivables.status,
      startDate: receivables.startDate,
      dueDate: receivables.dueDate,
    })
    .from(receivables)
    .where(ownedBy(receivables, userId))
    .orderBy(asc(receivables.startDate));

  return toCsv(
    RECEIVABLE_HEADERS,
    rows.map((r) => [
      r.id,
      r.debtorName,
      moneyToDecimalString(r.initialAmount),
      moneyToDecimalString(r.remainingAmount),
      r.status,
      r.startDate,
      r.dueDate ?? '',
    ]),
  );
}

export interface ExportResult {
  generatedAt: string;
  transactions: string;
  wallets: string;
  assets: string;
  debts: string;
  receivables: string;
}
