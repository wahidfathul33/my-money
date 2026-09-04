/**
 * "Remembers" the last household choice made for a given category — purely
 * a client-side convenience (tasks/12-sharing-and-privacy/spec.md "Pilihan
 * household terakhir diingat per kategori"), not a server-persisted
 * preference: there's no acceptance criterion asking for it to survive a
 * device change, and adding a DB column/table for it would be exactly the
 * kind of "per-user per-something" persistence surface docs/03-domain-model.md
 * §5's closing note warns against growing casually.
 *
 * Used only by the Add Transaction sheet (src/features/transactions/components/add-transaction-sheet.tsx)
 * to prefill the 🏠 toggle's default the moment a category is picked — the
 * Edit sheet shows the transaction's ACTUAL existing tag instead, never a
 * guessed default.
 */

const STORAGE_KEY_PREFIX = 'mymoney:last-household-by-category:';

/** `null` covers both "never recorded" and storage being unavailable (private browsing, quota, SSR) — callers can't tell the difference and don't need to. */
export function getLastHouseholdChoice(categoryId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY_PREFIX + categoryId);
  } catch {
    return null;
  }
}

/** `householdId: null` forgets the choice for this category (the user explicitly turned tagging off) rather than leaving a stale entry behind. */
export function setLastHouseholdChoice(categoryId: string, householdId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (householdId) {
      window.localStorage.setItem(STORAGE_KEY_PREFIX + categoryId, householdId);
    } else {
      window.localStorage.removeItem(STORAGE_KEY_PREFIX + categoryId);
    }
  } catch {
    // Storage unavailable — the toggle still works for this sheet session,
    // it just won't remember next time. A convenience, not correctness.
  }
}
