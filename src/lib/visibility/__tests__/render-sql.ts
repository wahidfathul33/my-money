/**
 * Renders a Drizzle `SQL` condition to `{ sql, params }` WITHOUT a live DB
 * connection, so the visibility predicates' SQL-builder half
 * (`visibleTransactionsWhere`, `householdWealthJoin`, `notExcludedFromHousehold`)
 * can be unit tested for exact structure/params, not just exercised for
 * coverage. Same dialect config (`casing: 'snake_case'`) as
 * src/lib/db/read.ts / src/lib/db/write.ts — though every column in this
 * schema already declares its own explicit snake_case DB name (e.g.
 * `uuid('household_id')`), so the casing option is inert here; kept for
 * parity with the real connections regardless.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const dialect = new PgDialect({ casing: 'snake_case' });

export function renderSql(condition: SQL): { sql: string; params: unknown[] } {
  const query = dialect.sqlToQuery(condition);
  return { sql: query.sql, params: [...query.params] };
}
