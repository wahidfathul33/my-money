/**
 * Cursor keyset pagination for `/transactions` — tasks/09-transaction-history/spec.md
 * "Cursor keyset, bukan offset": the cursor is a base64 encoding of
 * `{iso_date}|{id}`, matching `tx_user_date_idx`'s exact shape
 * `(user_id, transaction_date DESC, id DESC)` (src/lib/db/schema/transactions.ts).
 *
 * Why keyset and not offset: a new transaction inserted while the user is
 * mid-scroll shifts every OFFSET-based page by one row, causing the next
 * page fetch to either skip a row (item silently missing from history — the
 * worst possible bug in a finance app) or repeat one. Keyset pagination
 * anchors on the last-seen row's own sort key, so inserts anywhere else in
 * the table can't shift it — proven in
 * src/features/transactions/__tests__/cursor.test.ts's round-trip cases and
 * src/lib/services/__tests__/transaction-history.integration.test.ts's
 * concurrent-insert case.
 */

export interface TransactionCursor {
  /** `transactions.transaction_date`, ISO 8601 — NOT the local grouping date. */
  transactionDate: string;
  id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque, URL-safe cursor string — `base64url({iso_date}|{id})`. */
export function encodeCursor(cursor: TransactionCursor): string {
  const raw = `${cursor.transactionDate}|${cursor.id}`;
  return Buffer.from(raw, 'utf-8').toString('base64url');
}

/**
 * Decodes and validates a cursor. Returns `null` — never throws — for
 * anything malformed, so a tampered or stale `?cursor=` query param in a
 * bookmarked/shared URL degrades to "start from the top" instead of a 500.
 */
export function decodeCursor(raw: string): TransactionCursor | null {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf-8');
  } catch {
    return null;
  }

  const separatorIndex = decoded.lastIndexOf('|');
  if (separatorIndex === -1) return null;

  const transactionDate = decoded.slice(0, separatorIndex);
  const id = decoded.slice(separatorIndex + 1);
  if (!transactionDate || !id) return null;
  if (Number.isNaN(new Date(transactionDate).getTime())) return null;
  if (!UUID_RE.test(id)) return null;

  return { transactionDate, id };
}
