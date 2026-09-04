/**
 * Transaction visibility predicate — docs/12-security-and-auth.md §4.1,
 * docs/03-domain-model.md §5 mechanism #1 ("tag transaksi ke household").
 * This is one of only TWO forms of cross-user read this app allows at all —
 * the other is src/lib/visibility/household-items.ts — per
 * tasks/12-sharing-and-privacy/spec.md "dua mekanisme saja". Every query
 * that can return someone ELSE's transaction rows MUST filter through
 * `visibleTransactionsWhere`, never re-derive the same OR by hand — enforced
 * by eslint rule `local/require-visibility-module` (eslint.config.mjs).
 *
 * Module is deliberately small and pure (docs/12 §4: "Modulnya kecil, murni,
 * dan menentukan siapa boleh melihat data siapa") — 100% branch coverage is
 * both attainable and required (tasks/12-sharing-and-privacy/todo.md).
 */
import { and, eq, inArray, isNotNull, or, type SQL } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { householdMembers, transactions } from '@/lib/db/schema';

/**
 * Pure, in-memory restatement of the exact same rule `visibleTransactionsWhere`
 * (below) builds as SQL — no DB access, so every branch of docs/12 §4.1's
 * "dua klausa" is unit-testable with no fixtures, mocking, or database. Also
 * usable directly by any caller that already holds a transaction row and the
 * viewer's active household-id list (e.g. an in-memory cache) and wants a
 * visibility check without a query.
 *
 * `__tests__/transactions.integration.test.ts` proves this and the SQL
 * version agree against the real database for a representative matrix of
 * rows — the two must never be allowed to drift apart.
 */
export interface VisibilityTransactionInfo {
  userId: string;
  householdId: string | null;
}

export function isTransactionVisible(
  viewerId: string,
  activeHouseholdIds: readonly string[],
  transaction: VisibilityTransactionInfo,
): boolean {
  if (transaction.userId === viewerId) return true;
  if (transaction.householdId === null) return false;
  return activeHouseholdIds.includes(transaction.householdId);
}

/**
 * SQL-level version of `isTransactionVisible`, for a real `transactions`
 * query's `.where(...)` — docs/12 §4.1's exact two clauses:
 *
 *   t.user_id = $me
 *   OR (t.household_id IS NOT NULL AND t.household_id = ANY($my_active_household_ids))
 *
 * Deliberately does NOT fold in `voided_at IS NULL` — that's a lifecycle
 * filter each caller already applies itself (e.g.
 * src/features/transactions/history-queries.ts's `buildFilterConditions`),
 * orthogonal to WHO is allowed to see the row at all: a caller viewing their
 * OWN just-voided transaction (the 5-second undo window) is a different,
 * unrelated concern from cross-user visibility.
 *
 * The `activeHouseholdIds.length === 0` case is handled explicitly rather
 * than relying on Drizzle's `inArray([])` → `sql\`false\`` special-case
 * (real and correct, but an implementation detail of a dependency) — a
 * security predicate should read as obviously correct from this file alone,
 * not from knowledge of what `inArray` happens to do with an empty array.
 */
export function visibleTransactionsWhere(viewerId: string, activeHouseholdIds: readonly string[]): SQL {
  const ownRow = eq(transactions.userId, viewerId);
  if (activeHouseholdIds.length === 0) {
    return ownRow;
  }

  // Both arms below are always-defined `SQL` (never the `undefined` arm of
  // drizzle-orm's `and`/`or` typing, which only triggers when EVERY
  // argument is `undefined`) — the `!` is a type-system formality, not a
  // runtime risk. See __tests__/transactions.test.ts for the rendered-SQL
  // proof.
  const householdTagged = and(
    isNotNull(transactions.householdId),
    inArray(transactions.householdId, [...activeHouseholdIds]),
  )!;

  return or(ownRow, householdTagged)!;
}

/**
 * Every household id `userId` is an ACTIVE member of right now — docs §4.1's
 * `$my_active_household_ids`. Meant to be resolved ONCE per request
 * (todo.md: "diambil sekali per request") and threaded into
 * `visibleTransactionsWhere` / `isTransactionVisible`, never re-queried per
 * row or per candidate household.
 */
export async function getActiveHouseholdIds(userId: string): Promise<string[]> {
  const rows = await dbRead
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(and(eq(householdMembers.userId, userId), eq(householdMembers.status, 'active')));
  return rows.map((row) => row.householdId);
}

/**
 * All transactions tagged to ONE specific household — the household
 * expenses page's shape (src/features/sharing/household-transactions-queries.ts),
 * "everyone's transactions tagged to household X". Deliberately NOT the
 * same thing as `visibleTransactionsWhere(viewerId, [householdId])`: that
 * predicate's first clause (`t.user_id = $me`) would incorrectly pull in
 * the viewer's own UNTAGGED personal transactions too — this function has
 * no "me" at all, only the household.
 *
 * The caller MUST have already verified the viewer is an ACTIVE member of
 * `householdId` before using this (`requireHouseholdAccess`,
 * src/lib/services/households.ts) — unlike `visibleTransactionsWhere`,
 * this function has no viewer identity to check membership against, so it
 * is not, by itself, a complete access-control decision.
 */
export function householdTaggedTransactionsWhere(householdId: string): SQL {
  return eq(transactions.householdId, householdId);
}
