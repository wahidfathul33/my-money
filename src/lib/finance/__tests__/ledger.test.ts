import { describe, expect, it } from 'vitest';
import type { TransactionClient } from '@/lib/db';
import { postEntries } from '../ledger';

/**
 * Pure-logic unit test for `postEntries` — this module's own doc comment
 * says "lib/finance stays free of live I/O so it can be reasoned about and
 * tested as plain functions" (docs/11-tech-architecture.md §3), but until
 * now its only tests were src/lib/finance/__tests__/ledger.integration.test.ts
 * and ledger.rollback.integration.test.ts, both against the real DB —
 * appropriate for proving atomicity, but not for this one guard, which
 * fires before `tx` is ever touched at all.
 *
 * `undefined` stands in for `tx` here deliberately, not a mock — it proves
 * the guard genuinely short-circuits before any transaction method is
 * called; a mock object would only prove the guard fires before whichever
 * methods happen to be stubbed on it.
 */
describe('postEntries — input guard (no DB required)', () => {
  it('throws before touching the transaction when entries is empty', async () => {
    await expect(postEntries(undefined as unknown as TransactionClient, [])).rejects.toThrow(RangeError);
  });
});
