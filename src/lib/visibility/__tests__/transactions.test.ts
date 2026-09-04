// @vitest-environment node
/**
 * Unit tests for src/lib/visibility/transactions.ts — pure, no database.
 * Target: 100% branch coverage of both `isTransactionVisible` (the in-memory
 * restatement) and `visibleTransactionsWhere` (the SQL builder), per
 * tasks/12-sharing-and-privacy/spec.md and todo.md.
 *
 * `__tests__/transactions.integration.test.ts` covers the real-database
 * behavior (cross-user isolation, `getActiveHouseholdIds`, and that the SQL
 * builder and the pure predicate agree) — this file is only about exhausting
 * every branch of the predicate logic itself.
 */
import { describe, expect, it } from 'vitest';
import { isTransactionVisible, visibleTransactionsWhere } from '../transactions';
import { renderSql } from './render-sql';

const ME = '00000000-0000-7000-8000-000000000001';
const OTHER = '00000000-0000-7000-8000-000000000002';
const HOUSEHOLD_A = '00000000-0000-7000-8000-0000000000aa';
const HOUSEHOLD_B = '00000000-0000-7000-8000-0000000000bb';

describe('isTransactionVisible', () => {
  it('is visible when the viewer owns the row (household irrelevant)', () => {
    expect(isTransactionVisible(ME, [], { userId: ME, householdId: null })).toBe(true);
    expect(isTransactionVisible(ME, [HOUSEHOLD_A], { userId: ME, householdId: HOUSEHOLD_B })).toBe(true);
  });

  it('is NOT visible when someone else owns it and it has no household tag', () => {
    expect(isTransactionVisible(ME, [HOUSEHOLD_A], { userId: OTHER, householdId: null })).toBe(false);
  });

  it('is visible when someone else owns it, tagged to a household the viewer actively belongs to', () => {
    expect(
      isTransactionVisible(ME, [HOUSEHOLD_A, HOUSEHOLD_B], { userId: OTHER, householdId: HOUSEHOLD_A }),
    ).toBe(true);
  });

  it('is NOT visible when someone else owns it, tagged to a household the viewer is NOT an active member of', () => {
    expect(isTransactionVisible(ME, [HOUSEHOLD_B], { userId: OTHER, householdId: HOUSEHOLD_A })).toBe(
      false,
    );
    // Empty list — e.g. the viewer belongs to no household at all.
    expect(isTransactionVisible(ME, [], { userId: OTHER, householdId: HOUSEHOLD_A })).toBe(false);
  });
});

describe('visibleTransactionsWhere', () => {
  it('with no active households, reduces to ownership only', () => {
    const { sql, params } = renderSql(visibleTransactionsWhere(ME, []));
    expect(sql).toBe('"transactions"."user_id" = $1');
    expect(params).toEqual([ME]);
    // No household clause leaked in when the list is empty.
    expect(sql).not.toMatch(/household_id/);
  });

  it('with active households, ORs ownership with the household-tag clause', () => {
    const { sql, params } = renderSql(visibleTransactionsWhere(ME, [HOUSEHOLD_A, HOUSEHOLD_B]));

    expect(sql).toContain('"transactions"."user_id" = $1');
    expect(sql).toContain('"transactions"."household_id" is not null');
    expect(sql).toContain('"transactions"."household_id" in ($2, $3)');
    expect(sql).toMatch(/^\(.* or .*\)$/);
    expect(params).toEqual([ME, HOUSEHOLD_A, HOUSEHOLD_B]);
  });

  it('never mentions voided_at — lifecycle filtering is the caller\'s job', () => {
    const { sql } = renderSql(visibleTransactionsWhere(ME, [HOUSEHOLD_A]));
    expect(sql).not.toMatch(/voided_at/);
  });
});
