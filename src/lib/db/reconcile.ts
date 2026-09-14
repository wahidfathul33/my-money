/**
 * Reconciliation — docs/05-financial-integrity.md §5.
 *
 * These queries REPORT drift, they never fix it. Silent auto-repair would
 * hide the bug that caused it. A finding triggers an alert and gets handled
 * manually with a documented `adjustment` entry — never a direct `UPDATE`.
 *
 * The cron endpoint that calls this daily (03:00 WIB) lands in task 23; this
 * module exists now so every financial task after this one can call it in
 * tests to prove it leaves no drift.
 *
 * Read-only by construction: every function here uses `dbRead`. There is
 * nothing here that could touch `wallets.balance` even by mistake.
 */
import { sql } from 'drizzle-orm';
import { dbRead } from './read';

export interface WalletBalanceDrift {
  walletId: string;
  walletName: string;
  cachedBalance: string;
  actualBalance: string;
  drift: string;
}

/** I1: wallet.balance must equal SUM(non-void ledger_entries.amount) for that wallet. */
export async function findWalletBalanceDrift(): Promise<WalletBalanceDrift[]> {
  const rows = await dbRead.execute<{
    id: string;
    name: string;
    cached: string;
    actual: string;
    drift: string;
  }>(sql`
    SELECT w.id, w.name, w.balance AS cached,
           COALESCE(SUM(l.amount), 0) AS actual,
           w.balance - COALESCE(SUM(l.amount), 0) AS drift
    FROM wallets w
    LEFT JOIN ledger_entries l
           ON l.wallet_id = w.id AND l.voided_at IS NULL
    GROUP BY w.id, w.name, w.balance
    HAVING w.balance <> COALESCE(SUM(l.amount), 0)
  `);

  return rows.rows.map((r) => ({
    walletId: r.id,
    walletName: r.name,
    cachedBalance: r.cached,
    actualBalance: r.actual,
    drift: r.drift,
  }));
}

export interface OwnerMismatch {
  ledgerEntryId: string;
  entryOwnerId: string;
  walletOwnerId: string;
}

/**
 * I11: a ledger entry's owner must always equal its wallet's owner.
 *
 * A finding here is a security incident, not a numeric discrepancy — it
 * means some code path wrote to another user's ledger. Handling starts with
 * finding that code path, not with fixing the row.
 */
export async function findLedgerOwnerMismatches(): Promise<OwnerMismatch[]> {
  const rows = await dbRead.execute<{
    id: string;
    entry_owner: string;
    wallet_owner: string;
  }>(sql`
    SELECT le.id, le.user_id AS entry_owner, w.user_id AS wallet_owner
    FROM ledger_entries le
    JOIN wallets w ON w.id = le.wallet_id
    WHERE le.user_id <> w.user_id
  `);

  return rows.rows.map((r) => ({
    ledgerEntryId: r.id,
    entryOwnerId: r.entry_owner,
    walletOwnerId: r.wallet_owner,
  }));
}

export interface UnbalancedTransferPair {
  transactionId: string;
  total: string;
}

/** I12: a member transfer's two linked transactions must net to zero. */
export async function findUnbalancedMemberTransfers(): Promise<UnbalancedTransferPair[]> {
  const rows = await dbRead.execute<{ id: string; total: string }>(sql`
    SELECT a.id, COALESCE(SUM(le.amount), 0) AS total
    FROM transactions a
    JOIN transactions b ON b.id = a.linked_transaction_id
    LEFT JOIN ledger_entries le
           ON le.transaction_id IN (a.id, b.id) AND le.voided_at IS NULL
    WHERE a.type = 'transfer' AND a.counterparty_user_id IS NOT NULL
      AND a.voided_at IS NULL
    GROUP BY a.id
    HAVING COALESCE(SUM(le.amount), 0) <> 0
  `);

  return rows.rows.map((r) => ({ transactionId: r.id, total: r.total }));
}

/** I19: only the receiving side of a member transfer may be written by someone else. */
export async function findInvalidCreatedByRows(): Promise<string[]> {
  const rows = await dbRead.execute<{ id: string }>(sql`
    SELECT id FROM transactions
    WHERE created_by <> user_id
      AND NOT (type = 'transfer' AND counterparty_user_id = created_by)
  `);

  return rows.rows.map((r) => r.id);
}

/** I18: a transfer link must be bidirectional — if A→B then B→A. */
export async function findOneWayTransferLinks(): Promise<string[]> {
  const rows = await dbRead.execute<{ id: string }>(sql`
    SELECT a.id FROM transactions a
    JOIN transactions b ON b.id = a.linked_transaction_id
    WHERE b.linked_transaction_id IS DISTINCT FROM a.id
  `);

  return rows.rows.map((r) => r.id);
}

export interface ObligationRemainingDrift {
  obligationId: string;
  cachedRemaining: string;
  actualRemaining: string;
  drift: string;
}

/**
 * I4 (task 18): `debts.remaining_amount` must always equal
 * `initial_amount − SUM(non-void debt_payments.amount)` — `remaining_amount`
 * is a CACHE (src/lib/db/schema/obligations.ts's own column comment), and
 * `applyRemainingDelta` (src/lib/services/obligations.ts) is the only
 * code path allowed to move it, always via the same SQL-relative-delta
 * discipline `findWalletBalanceDrift` verifies for `wallets.balance`.
 */
export async function findDebtRemainingDrift(): Promise<ObligationRemainingDrift[]> {
  const rows = await dbRead.execute<{ id: string; cached: string; actual: string; drift: string }>(sql`
    SELECT d.id, d.remaining_amount AS cached,
           d.initial_amount - COALESCE(SUM(dp.amount), 0) AS actual,
           d.remaining_amount - (d.initial_amount - COALESCE(SUM(dp.amount), 0)) AS drift
    FROM debts d
    LEFT JOIN debt_payments dp
           ON dp.debt_id = d.id AND dp.voided_at IS NULL
    GROUP BY d.id, d.remaining_amount, d.initial_amount
    HAVING d.remaining_amount <> (d.initial_amount - COALESCE(SUM(dp.amount), 0))
  `);

  return rows.rows.map((r) => ({
    obligationId: r.id,
    cachedRemaining: r.cached,
    actualRemaining: r.actual,
    drift: r.drift,
  }));
}

/** Same as `findDebtRemainingDrift`, for `receivables`/`receivable_payments`. */
export async function findReceivableRemainingDrift(): Promise<ObligationRemainingDrift[]> {
  const rows = await dbRead.execute<{ id: string; cached: string; actual: string; drift: string }>(sql`
    SELECT r.id, r.remaining_amount AS cached,
           r.initial_amount - COALESCE(SUM(rp.amount), 0) AS actual,
           r.remaining_amount - (r.initial_amount - COALESCE(SUM(rp.amount), 0)) AS drift
    FROM receivables r
    LEFT JOIN receivable_payments rp
           ON rp.receivable_id = r.id AND rp.voided_at IS NULL
    GROUP BY r.id, r.remaining_amount, r.initial_amount
    HAVING r.remaining_amount <> (r.initial_amount - COALESCE(SUM(rp.amount), 0))
  `);

  return rows.rows.map((r) => ({
    obligationId: r.id,
    cachedRemaining: r.cached,
    actualRemaining: r.actual,
    drift: r.drift,
  }));
}

export interface ReconciliationReport {
  walletBalanceDrift: WalletBalanceDrift[];
  ledgerOwnerMismatches: OwnerMismatch[];
  unbalancedMemberTransfers: UnbalancedTransferPair[];
  invalidCreatedByRows: string[];
  oneWayTransferLinks: string[];
  debtRemainingDrift: ObligationRemainingDrift[];
  receivableRemainingDrift: ObligationRemainingDrift[];
  hasFindings: boolean;
}

/** Runs every invariant check and reports findings. Never auto-repairs. */
export async function runReconciliation(): Promise<ReconciliationReport> {
  // Sequential on purpose, not Promise.all: this runs once a day (cron, not
  // a request path), and five concurrent HTTP requests from the same
  // neon-http client have been observed to contend for connections badly
  // enough to time out under some network conditions. Five short queries in
  // series cost about a second total — a fine trade for not being fragile.
  const walletBalanceDrift = await findWalletBalanceDrift();
  const ledgerOwnerMismatches = await findLedgerOwnerMismatches();
  const unbalancedMemberTransfers = await findUnbalancedMemberTransfers();
  const invalidCreatedByRows = await findInvalidCreatedByRows();
  const oneWayTransferLinks = await findOneWayTransferLinks();
  const debtRemainingDrift = await findDebtRemainingDrift();
  const receivableRemainingDrift = await findReceivableRemainingDrift();

  const hasFindings =
    walletBalanceDrift.length > 0 ||
    ledgerOwnerMismatches.length > 0 ||
    unbalancedMemberTransfers.length > 0 ||
    invalidCreatedByRows.length > 0 ||
    oneWayTransferLinks.length > 0 ||
    debtRemainingDrift.length > 0 ||
    receivableRemainingDrift.length > 0;

  return {
    walletBalanceDrift,
    ledgerOwnerMismatches,
    unbalancedMemberTransfers,
    invalidCreatedByRows,
    oneWayTransferLinks,
    debtRemainingDrift,
    receivableRemainingDrift,
    hasFindings,
  };
}
