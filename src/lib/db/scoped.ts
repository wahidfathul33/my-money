/**
 * Ownership scoping helper — docs/12-security-and-auth.md §3 "Lapisan 4".
 *
 * `userId` is a required parameter, not something `ownedBy` derives on its
 * own — so a query that forgot to scope its owner can't be written without
 * the missing argument standing out at the call site during review.
 *
 * Usage: `dbRead.select().from(wallets).where(ownedBy(wallets, user.id))`.
 */
import { eq } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

export function ownedBy<T extends { userId: PgColumn }>(table: T, userId: string) {
  return eq(table.userId, userId);
}
