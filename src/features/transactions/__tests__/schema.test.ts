/**
 * Unit tests for the transaction Zod schemas — structural proof that
 * `updateTransactionSchema` has no `idempotencyKey` field (edits aren't
 * idempotency-keyed the way a first save is — docs/05 §6 only requires it
 * "berlaku untuk transaksi", i.e. the create path) and that `amount` only
 * accepts the plain-digit `serializeMoney` shape, never a decimal string or
 * a signed one (sign lives on the ledger, docs/05 §4).
 */
import { describe, expect, it } from 'vitest';
import { createTransactionSchema, moneyAmountSchema, updateTransactionSchema } from '../schema';

describe('createTransactionSchema', () => {
  it('requires an idempotencyKey', () => {
    expect('idempotencyKey' in createTransactionSchema.shape).toBe(true);
  });

  it('parses valid input', () => {
    const parsed = createTransactionSchema.parse({
      type: 'expense',
      amount: '4500000',
      categoryId: '00000000-0000-7000-8000-000000000001',
      walletId: '00000000-0000-7000-8000-000000000002',
      transactionDate: new Date('2026-09-01T00:00:00Z'),
      note: '',
      idempotencyKey: '00000000-0000-7000-8000-000000000003',
    });
    expect(parsed.note).toBeNull(); // '' normalizes to null
    expect(parsed.amount).toBe('4500000');
  });

  it('rejects an invalid type', () => {
    const result = createTransactionSchema.safeParse({
      type: 'transfer', // out of scope for this task (task 08)
      amount: '4500000',
      categoryId: '00000000-0000-7000-8000-000000000001',
      walletId: '00000000-0000-7000-8000-000000000002',
      transactionDate: new Date(),
      note: '',
      idempotencyKey: '00000000-0000-7000-8000-000000000003',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateTransactionSchema', () => {
  it('has no idempotencyKey field in its shape', () => {
    expect('idempotencyKey' in updateTransactionSchema.shape).toBe(false);
  });

  it('accepts a literal null note, not just an omitted/empty-string one', () => {
    // edit-transaction-sheet.tsx sends `note: null` (a plain object, not
    // FormData) for "no note" — a bare `.optional()` on noteSchema widens
    // the accepted type to `string | undefined` only, NOT `null`, which
    // previously surfaced Zod's raw English `invalid_type` message
    // ("Invalid input: expected string, received null") straight into the
    // edit sheet's error banner for any edit with an empty note.
    const parsed = updateTransactionSchema.parse({
      transactionId: '00000000-0000-7000-8000-000000000001',
      type: 'expense',
      amount: '4500000',
      categoryId: '00000000-0000-7000-8000-000000000002',
      walletId: '00000000-0000-7000-8000-000000000003',
      transactionDate: new Date(),
      note: null,
    });
    expect(parsed.note).toBeNull();
  });

  it('drops an unknown idempotencyKey field smuggled into the payload', () => {
    const parsed = updateTransactionSchema.parse({
      transactionId: '00000000-0000-7000-8000-000000000001',
      type: 'expense',
      amount: '4500000',
      categoryId: '00000000-0000-7000-8000-000000000002',
      walletId: '00000000-0000-7000-8000-000000000003',
      transactionDate: new Date(),
      note: '',
      idempotencyKey: '00000000-0000-7000-8000-000000000004',
    });
    expect(parsed).not.toHaveProperty('idempotencyKey');
  });
});

describe('moneyAmountSchema', () => {
  it('accepts a plain digit string', () => {
    expect(moneyAmountSchema.safeParse('4500000').success).toBe(true);
  });

  it.each(['45000.50', '-45000', '', 'abc', '45,000'])('rejects %s', (value) => {
    expect(moneyAmountSchema.safeParse(value).success).toBe(false);
  });
});
