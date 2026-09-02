/**
 * `dbRead` (src/lib/db/read.ts) is the neon-http connection: read-only by
 * design, because neon-http can't give real multi-statement transactions
 * (docs/05-financial-integrity.md §1). Its exported type already omits
 * insert/update/delete/transaction, so this mostly catches misuse through an
 * `as` cast or a `dbRead` variable that shadows the real one — belt and
 * braces alongside the TypeScript type.
 *
 * @type {import('eslint').Rule.RuleModule}
 */
const MUTATING_METHODS = new Set(['insert', 'update', 'delete', 'transaction']);

export const noDbReadMutation = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'dbRead is the read-only neon-http connection; writes must go through dbWrite (src/lib/db/write.ts).',
    },
    schema: [],
    messages: {
      noMutation:
        'dbRead is read-only (neon-http has no real multi-statement transactions — see docs/05-financial-integrity.md §1). Use dbWrite for "{{method}}".',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'dbRead' &&
          callee.property.type === 'Identifier' &&
          MUTATING_METHODS.has(callee.property.name)
        ) {
          context.report({
            node: callee.property,
            messageId: 'noMutation',
            data: { method: callee.property.name },
          });
        }
      },
    };
  },
};

export default noDbReadMutation;
