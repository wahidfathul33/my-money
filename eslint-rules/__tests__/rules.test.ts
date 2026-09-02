// @vitest-environment node
/**
 * Unit tests for the local ESLint rules that enforce the two rules
 * docs/05-financial-integrity.md is built on: money is bigint (never
 * number), and dbRead never writes. Uses ESLint's Linter class directly
 * (rather than RuleTester) so it runs under Vitest without extra glue.
 */
import { describe, expect, it } from 'vitest';
import { Linter } from 'eslint';
import type { Linter as LinterTypes, Rule } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { noDbReadMutation } from '../no-db-read-mutation.js';
import { noMoneyNumber } from '../no-money-number.js';

function lint(code: string, ruleId: string, rule: unknown) {
  const linter = new Linter({ configType: 'flat' });
  const config: LinterTypes.Config = {
    languageOptions: {
      // eslint's flat-config type wants its own Parser shape; the real
      // @typescript-eslint/parser is structurally compatible at runtime.
      parser: tsParser as unknown as LinterTypes.Parser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { local: { rules: { [ruleId]: rule as Rule.RuleModule } } },
    rules: { [`local/${ruleId}`]: 'error' },
  };
  return linter.verify(code, config);
}

describe('local/no-db-read-mutation', () => {
  const rule = 'no-db-read-mutation';

  it('flags dbRead.insert(...)', () => {
    const messages = lint(`dbRead.insert(foo).values({});`, rule, noDbReadMutation);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toMatch(/insert/);
  });

  it('flags dbRead.update(...)', () => {
    const messages = lint(`dbRead.update(foo).set({});`, rule, noDbReadMutation);
    expect(messages).toHaveLength(1);
  });

  it('flags dbRead.delete(...)', () => {
    const messages = lint(`dbRead.delete(foo);`, rule, noDbReadMutation);
    expect(messages).toHaveLength(1);
  });

  it('flags dbRead.transaction(...)', () => {
    const messages = lint(`dbRead.transaction(async (tx) => {});`, rule, noDbReadMutation);
    expect(messages).toHaveLength(1);
  });

  it('does not flag dbRead.select(...)', () => {
    const messages = lint(`dbRead.select().from(foo);`, rule, noDbReadMutation);
    expect(messages).toHaveLength(0);
  });

  it('does not flag dbWrite.insert(...) (different identifier)', () => {
    const messages = lint(`dbWrite.insert(foo).values({});`, rule, noDbReadMutation);
    expect(messages).toHaveLength(0);
  });

  it('does not flag an unrelated object with an insert method', () => {
    const messages = lint(`someArray.insert(1);`, rule, noDbReadMutation);
    expect(messages).toHaveLength(0);
  });
});

describe('local/no-money-number', () => {
  const rule = 'no-money-number';

  it('flags a number-typed function parameter named "amount"', () => {
    const messages = lint(`function f(amount: number) {}`, rule, noMoneyNumber);
    expect(messages).toHaveLength(1);
  });

  it('flags a number-typed variable named "balance"', () => {
    const messages = lint(`const balance: number = 0;`, rule, noMoneyNumber);
    expect(messages).toHaveLength(1);
  });

  it('flags a number-typed camelCase field like "totalAmount"', () => {
    const messages = lint(`interface X { totalAmount: number }`, rule, noMoneyNumber);
    expect(messages).toHaveLength(1);
  });

  it('flags a number-typed snake_case-ish field like "price_per_gram"', () => {
    const messages = lint(`interface X { price_per_gram: number }`, rule, noMoneyNumber);
    expect(messages).toHaveLength(1);
  });

  it('flags a number-typed class field named "principal"', () => {
    const messages = lint(`class X { principal: number = 0; }`, rule, noMoneyNumber);
    expect(messages).toHaveLength(1);
  });

  it('does not flag a bigint-typed "amount"', () => {
    const messages = lint(`function f(amount: bigint) {}`, rule, noMoneyNumber);
    expect(messages).toHaveLength(0);
  });

  it('does not flag a number-typed field with an unrelated name', () => {
    const messages = lint(`interface X { count: number }`, rule, noMoneyNumber);
    expect(messages).toHaveLength(0);
  });

  it('does not flag a money-named field with a non-number, non-bigint type (e.g. string)', () => {
    const messages = lint(`interface X { amount: string }`, rule, noMoneyNumber);
    expect(messages).toHaveLength(0);
  });

  it('matches on whole words split from camelCase, not substrings (e.g. "totalAmount" matches, "amounts" does not)', () => {
    // The rule splits camelCase into words and checks each word against the
    // exact set {amount, balance, price, principal}. "amounts" (plural) is
    // a different word and is NOT flagged — documenting current behavior.
    const flagged = lint(`interface X { totalAmount: number }`, rule, noMoneyNumber);
    expect(flagged).toHaveLength(1);
    const notFlagged = lint(`interface X { amounts: number }`, rule, noMoneyNumber);
    expect(notFlagged).toHaveLength(0);
  });
});
