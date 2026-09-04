/**
 * docs/12-security-and-auth.md §4: the transaction-visibility predicate
 * (ownership OR household-tag, §4.1) and the household-wealth-item join
 * (`share_wealth = true`, §4.2) are implemented exactly ONCE, in
 * `src/lib/visibility/**`, and must never be re-derived inline anywhere else
 * — tasks/12-sharing-and-privacy/spec.md "Batasan": "Jangan ... menyalin
 * predikat visibilitas ke query lain."
 *
 * This can't (without a type checker doing real data-flow analysis) prove a
 * given query IS a cross-user read — it flags the two SPECIFIC shapes that,
 * as of this rule's introduction, only ever legitimately appear inside
 * `src/lib/visibility/**`:
 *
 *   1. An `or(...)` whose arguments reference BOTH a `userId` comparison and
 *      a `householdId` comparison — the exact shape of docs §4.1's two
 *      clauses (`t.user_id = $me OR (t.household_id IS NOT NULL AND ...)`).
 *      Every OTHER `userId`/`householdId` combination in this codebase is
 *      joined with `and(...)`, scoping a query to the CALLER's own
 *      household-tagged rows (not a cross-user read) — see e.g.
 *      src/lib/services/memberships.ts's `revokeSharingFor`.
 *
 *   2. An `eq(...)` comparing `shareWealth` — docs §4.2's join condition.
 *      Every other reference to `shareWealth` in this codebase is a WRITE
 *      via `.set({ shareWealth: ... })` (src/lib/services/memberships.ts,
 *      invitations.ts), never a read-side equality check.
 *
 * Scoped OFF for `src/lib/visibility/**` itself via `eslint.config.mjs`
 * (both shapes appear there legitimately, exactly once).
 *
 * @type {import('eslint').Rule.RuleModule}
 */
const USER_ID_RE = /\buserId\b/;
const HOUSEHOLD_ID_RE = /\bhouseholdId\b/;
const SHARE_WEALTH_RE = /\bshareWealth\b/;

function isCombinatorCall(node, name) {
  return node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === name;
}

export const requireVisibilityModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Cross-user visibility predicates (docs/12-security-and-auth.md §4) must be implemented once, in src/lib/visibility/**, never re-derived inline.',
    },
    schema: [],
    messages: {
      noInlineOr:
        'This or(...) combines a userId check with a householdId check — that is the transaction-visibility predicate from docs/12-security-and-auth.md §4.1. Import visibleTransactionsWhere/isTransactionVisible from src/lib/visibility/transactions.ts instead of re-deriving it here.',
      noInlineShareWealth:
        'Comparing shareWealth directly is the household-wealth-item predicate from docs/12-security-and-auth.md §4.2. Import householdWealthJoin/notExcludedFromHousehold from src/lib/visibility/household-items.ts instead of re-deriving it here.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (isCombinatorCall(node, 'or')) {
          const combined = node.arguments.map((arg) => sourceCode.getText(arg)).join(' ');
          if (USER_ID_RE.test(combined) && HOUSEHOLD_ID_RE.test(combined)) {
            context.report({ node, messageId: 'noInlineOr' });
          }
        }

        if (isCombinatorCall(node, 'eq') && node.arguments.length > 0) {
          const target = sourceCode.getText(node.arguments[0]);
          if (SHARE_WEALTH_RE.test(target)) {
            context.report({ node, messageId: 'noInlineShareWealth' });
          }
        }
      },
    };
  },
};

export default requireVisibilityModule;
