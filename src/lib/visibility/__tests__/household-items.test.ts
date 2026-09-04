// @vitest-environment node
/**
 * Unit tests for src/lib/visibility/household-items.ts — pure, no database.
 * Target: 100% branch coverage of `isHouseholdItemVisible` (the in-memory
 * restatement) plus structural checks on the SQL builders
 * (`householdWealthJoin`, `notExcludedFromHousehold`), per
 * tasks/12-sharing-and-privacy/spec.md and todo.md.
 *
 * `__tests__/household-items.integration.test.ts` covers the real-database
 * behavior (share_wealth on/off, exclude_from_household, removed members,
 * cross-household isolation) — this file only exhausts the predicate logic.
 *
 * Exercised against `wallets` — the one table in `HouseholdWealthTable`'s
 * shape with a real feature today; `assets`/`debts`/`receivables`/
 * `savings_goals` share the identical `user_id` + `exclude_from_household`
 * shape (see this module's file header), so the same functions apply to
 * them unchanged once those features land.
 */
import { describe, expect, it } from 'vitest';
import { wallets } from '@/lib/db/schema';
import {
  householdWealthJoin,
  isHouseholdItemVisible,
  notExcludedFromHousehold,
} from '../household-items';
import { renderSql } from './render-sql';

const HOUSEHOLD = '00000000-0000-7000-8000-0000000000aa';

describe('isHouseholdItemVisible', () => {
  it('is NOT visible with no membership at all', () => {
    expect(isHouseholdItemVisible(undefined, false)).toBe(false);
  });

  it('is NOT visible when the membership is not active (e.g. removed)', () => {
    expect(isHouseholdItemVisible({ status: 'removed', shareWealth: true }, false)).toBe(false);
  });

  it('is NOT visible when share_wealth is off, even with an active membership', () => {
    expect(isHouseholdItemVisible({ status: 'active', shareWealth: false }, false)).toBe(false);
  });

  it('is NOT visible when the specific item is excluded, even with sharing on', () => {
    expect(isHouseholdItemVisible({ status: 'active', shareWealth: true }, true)).toBe(false);
  });

  it('is visible only when ALL FOUR conditions hold: active + share_wealth + not excluded', () => {
    expect(isHouseholdItemVisible({ status: 'active', shareWealth: true }, false)).toBe(true);
  });
});

describe('householdWealthJoin', () => {
  it('joins on user_id + household_id + active + share_wealth — all four ANDed', () => {
    const { sql, params } = renderSql(householdWealthJoin(wallets, HOUSEHOLD));

    expect(sql).toContain('"household_members"."user_id" = "wallets"."user_id"');
    expect(sql).toContain('"household_members"."household_id" = $1');
    expect(sql).toContain('"household_members"."status" = $2');
    expect(sql).toContain('"household_members"."share_wealth" = $3');
    expect(sql).toMatch(/^\(.* and .* and .* and .*\)$/);
    expect(params).toEqual([HOUSEHOLD, 'active', true]);
  });
});

describe('notExcludedFromHousehold', () => {
  it('filters exclude_from_household = false', () => {
    const { sql, params } = renderSql(notExcludedFromHousehold(wallets));
    expect(sql).toBe('"wallets"."exclude_from_household" = $1');
    expect(params).toEqual([false]);
  });
});
