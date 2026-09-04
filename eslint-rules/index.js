import { noDbReadMutation } from './no-db-read-mutation.js';
import { noMoneyNumber } from './no-money-number.js';
import { requireVisibilityModule } from './require-visibility-module.js';

/**
 * Local ESLint plugin enforcing rules that keep financial/household data
 * correct: money is always bigint and writes always go through dbWrite
 * (docs/05-financial-integrity.md), and cross-user visibility predicates
 * are never re-derived outside src/lib/visibility/**
 * (docs/12-security-and-auth.md §4). Wired up in eslint.config.mjs under
 * the `local/` prefix.
 */
export const localRulesPlugin = {
  rules: {
    'no-db-read-mutation': noDbReadMutation,
    'no-money-number': noMoneyNumber,
    'require-visibility-module': requireVisibilityModule,
  },
};

export default localRulesPlugin;
