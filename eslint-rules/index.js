import { noDbReadMutation } from './no-db-read-mutation.js';
import { noMoneyNumber } from './no-money-number.js';

/**
 * Local ESLint plugin enforcing the two rules from
 * docs/05-financial-integrity.md that keep financial data correct:
 * money is always bigint, and writes always go through dbWrite.
 * Wired up in eslint.config.mjs under the `local/` prefix.
 */
export const localRulesPlugin = {
  rules: {
    'no-db-read-mutation': noDbReadMutation,
    'no-money-number': noMoneyNumber,
  },
};

export default localRulesPlugin;
