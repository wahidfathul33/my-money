/**
 * docs/12-security-and-auth.md §6: "SQL injection | Drizzle memparameterisasi
 * seluruhnya; `sql.raw` dilarang aturan lint." `sql.raw` interpolates a
 * string directly into the generated SQL text instead of binding it as a
 * parameter — every other `sql\`...\`` template already parameterizes
 * interpolated values safely, so `sql.raw` is the one escape hatch that can
 * turn attacker-influenced input into arbitrary SQL if a future caller isn't
 * as careful as the one exempted call site below.
 *
 * Scoped OFF for src/features/transactions/history-queries.ts's
 * `getDayTotals`, which needs the timezone literal to appear identically in
 * both the SELECT list and GROUP BY (see that file's own doc comment for
 * why a bound parameter breaks Postgres's GROUP BY parse-tree check) — the
 * value is guarded by `assertSupportedTimezone`/`isValidTimeZone`
 * (src/lib/date/timezone.ts), which only accepts strings `Intl.DateTimeFormat`
 * recognizes as real IANA zone names, so it can never carry a quote or
 * statement separator. Exempted via `eslint.config.mjs`'s `ignores`, not
 * inline disable comments, so the exception stays reviewable in one place.
 *
 * @type {import('eslint').Rule.RuleModule}
 */
export const noSqlRaw = {
  meta: {
    type: 'problem',
    docs: {
      description: 'sql.raw bypasses Drizzle parameterization and is banned outside one documented exception.',
    },
    schema: [],
    messages: {
      noSqlRaw:
        'sql.raw bypasses Drizzle parameterization (docs/12-security-and-auth.md §6) — an injection vector if the interpolated value is ever attacker-influenced. Use a parameterized sql`` template instead.',
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
          callee.object.name === 'sql' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'raw'
        ) {
          context.report({ node: callee.property, messageId: 'noSqlRaw' });
        }
      },
    };
  },
};

export default noSqlRaw;
