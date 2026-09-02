/**
 * Money is always `bigint` (src/lib/finance/money.ts `Money`), never
 * `number` — docs/05-financial-integrity.md §2. A `number` silently loses
 * precision and invites `parseFloat`/`.toFixed()` nearby. This rule flags
 * `number` typing on any identifier/property whose name matches the money
 * word pattern (amount, balance, price, principal — case-insensitive, as a
 * whole camelCase/snake_case word, e.g. `totalAmount`, `wallet_balance`,
 * `pricePerGram`, `initialPrincipal`).
 *
 * @type {import('eslint').Rule.RuleModule}
 */
const MONEY_WORDS = new Set(['amount', 'balance', 'price', 'principal']);

/** Splits camelCase/PascalCase/snake_case into lowercase words. */
function wordsOf(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

function isMoneyName(name) {
  if (!name) return false;
  return wordsOf(name).some((w) => MONEY_WORDS.has(w));
}

function isNumberType(typeNode) {
  return !!typeNode && typeNode.type === 'TSNumberKeyword';
}

export const noMoneyNumber = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Money-pattern-named fields (amount/balance/price/principal) must be typed bigint, never number.',
    },
    schema: [],
    messages: {
      noNumber:
        '"{{name}}" matches the money-name pattern (amount/balance/price/principal) and must be bigint, not number — see src/lib/finance/money.ts.',
    },
  },
  create(context) {
    function check(nameNode, typeAnnotation) {
      if (!nameNode) return;
      const name = nameNode.type === 'Identifier' ? nameNode.name : undefined;
      if (!isMoneyName(name)) return;
      if (isNumberType(typeAnnotation)) {
        context.report({ node: nameNode, messageId: 'noNumber', data: { name } });
      }
    }

    return {
      // Covers function params and variable declarators, e.g.
      // `function f(amount: number)`, `const balance: number = ...`.
      Identifier(node) {
        if (node.typeAnnotation) {
          check(node, node.typeAnnotation.typeAnnotation);
        }
      },
      // Covers interface/type-literal members, e.g. `{ amount: number }`.
      TSPropertySignature(node) {
        check(node.key, node.typeAnnotation && node.typeAnnotation.typeAnnotation);
      },
      // Covers class fields, e.g. `class X { amount: number }`.
      PropertyDefinition(node) {
        check(node.key, node.typeAnnotation && node.typeAnnotation.typeAnnotation);
      },
    };
  },
};

export default noMoneyNumber;
