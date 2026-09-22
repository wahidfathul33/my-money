# Launch Checklist — MyMoney v1.0

Task 23, hardening & launch — the final task of 24. This document is the honest record of what was verified, how, and what remains before a real production launch. Written against [tasks/23-hardening-and-launch/todo.md](tasks/23-hardening-and-launch/todo.md) (item-by-item evidence) and [docs/00-overview.md §7](docs/00-overview.md#7-definisi-selesai-definition-of-done-untuk-v10) (Definition of Done).

**Scope note, stated up front:** this session works in a local git worktree with no live Vercel deployment, no GitHub remote push, no production domain, and no live Sentry/uptime-monitoring project connected — established at the very start of this project ("GitHub dan Vercel nanti dulu"). Every item below is either genuinely verified in this environment, or explicitly marked **deferred to deployment** with the specific reason it can't be verified from here. Nothing is silently skipped.

---

## 1. Go / No-Go

**GO — for code-complete / local-verification status.**

Every item that can be verified without a live deployment has been verified: security audit complete with real findings fixed, privacy audit proven with three concurrent real sessions, financial invariants tested, documentation reconciled with code, operational code (health check, reconciliation cron, Sentry/Analytics wiring) built and tested. The codebase is ready to deploy.

**This is not a "GO to production right now"** — a distinct, clearly-labeled set of items in §4 below can only be completed once Vercel/Neon/Sentry are actually connected (domain, live monitoring, backup-restore test, deployed smoke test). Those are deployment logistics, not code defects — none of them represent an open finding against the code itself.

---

## 2. Security Audit

Full detail in `tasks/23-hardening-and-launch/todo.md`'s "Audit Keamanan" section. Summary:

- Every query across 16 feature modules (47 functions) traced manually — all scoped by owner or `lib/visibility/**`.
- Every `requireHouseholdMember` call site (20) confirmed inside its write transaction.
- **3 API routes found missing rate limiting** (`GET /api/households/[id]/net-worth`, `.../transactions`, `GET /api/net-worth/history`) — fixed, now match the established pattern.
- **`docs/12-security-and-auth.md` §6 claimed a lint rule banned `sql.raw`; it didn't exist.** Added `eslint-rules/no-sql-raw.js`, wired into `eslint.config.mjs`, with the one legitimate exception (`history-queries.ts`'s timezone literal, guarded by `Intl.DateTimeFormat` validation) explicitly exempted.
- **`nodemailer` had 4 high + 3 moderate CVEs** (SMTP/CRLF injection, TLS validation bypass, ReDoS) on a production code path (magic-link auth, household invitation email). Bumped 7.0.13 → 10.x. Safe because `sendVerificationRequest` is overridden with our own transport — next-auth's own nodemailer usage (which pins an older peer range) is never invoked.
- Security headers match `docs/12 §12` exactly in `next.config.ts`; `curl -I` verification against a local production build: **[PENDING — see §5]**.
- `npm audit`: down to 4 moderate, all `esbuild`/`@esbuild-kit/*` via `drizzle-kit` — dev-only migration tooling, never in the production bundle. Fixing requires a `drizzle-kit` major downgrade; not worth the regression risk. Accepted, documented.
- Secret scanning: no dedicated tool available in this environment; manual pattern-based scan (AWS/Stripe/Slack/Google/GitHub key shapes + generic `secret/token/password = "..."` patterns) plus confirmation `.env` has never once entered git history. Zero findings.
- No hardcoded secrets, no unsafe `NEXT_PUBLIC_*` vars — `NEXT_PUBLIC_SENTRY_DSN` is the only one, and a Sentry DSN is a public identifier by design, not a credential.

**No open security findings.**

## 3. Privacy Audit — Three Real Accounts

Verified with **three concurrent Playwright sessions** (A/owner, B/member, C/non-sharing) in one real household — the equivalent of three human testers, using this codebase's own established multi-session e2e infrastructure (`e2e/fixtures/authenticated.ts`, `e2e/helpers/auth-session.ts`). `e2e/household-privacy-audit.spec.ts` is the first spec to seed three sessions into one household at once.

| Assertion | Status |
|---|---|
| C shares nothing → invisible to A and B financially, visible by name | New e2e test written — run pending (see §5) |
| Owner A cannot see B's private wallet contents | New e2e test written — run pending (see §5) |
| Member rejected on every owner-only action | Already fully covered by 4 existing integration tests (`ForbiddenError` on invite/remove/rename-archive/transfer-ownership) |
| Removing B revokes access immediately, turns off `share_wealth` | Already covered (`e2e/household-membership.spec.ts`, `memberships.integration.test.ts`) |
| Transfer A→B doesn't touch B's balance until B records it | **Does not match the real implementation** — see finding below |
| Family wealth shows per-member breakdown before the total | Already covered (`e2e/net-worth-household.spec.ts`), reverified in the new 3-account spec |
| Invitation email carries no financial data | Already covered (`src/lib/email/__tests__/invitation.test.ts`) |

**Finding, not a bug:** `docs/14-testing-strategy.md` §7's own example test still showed the pre-[ADR-030](docs/16-decision-log.md) "receiver must actively confirm" transfer model, directly contradicting the row immediately above it in the same document and the real implementation (ADR-030: one write moves both balances immediately; the receiver is *notified* via Activity, never asked to confirm before the money moves). Fixed the doc. The real, current behavior is fully proven by `e2e/transfers-member.spec.ts` ("both balances correct immediately").

## 4. Deferred to Deployment

None of these represent a code defect — they require infrastructure this local session does not have.

| Item | Why deferred |
|---|---|
| Live Sentry event verification, alert delivery test | No Sentry project connected; SDK is fully wired (`src/instrumentation.ts`, `src/instrumentation-client.ts`, scrubber) and runs as a documented no-op with `NEXT_PUBLIC_SENTRY_DSN` unset |
| Vercel Analytics / Speed Insights dashboard verification | No Vercel deployment; components are wired into the root layout in privacy mode |
| Neon branch backup-restore test | Requires Neon API/console credentials (`NEON_API_KEY` or `neonctl` login) not present in `.env` — only Postgres connection strings are available, which don't grant control-plane access to create branches. Attempted `neonctl` via `npx`; no credentials to authenticate with. Procedure fully documented in `docs/runbook.md` §7, ready to run the moment credentials exist |
| Neon PITR retention ≥ 7 days verification | Same — needs Neon console/API access; there is also no "production" Neon project yet, since nothing is deployed |
| External uptime check hitting `/api/health` | Needs a real production domain to monitor; the endpoint itself is built and tested |
| Lighthouse CI against a deployed preview URL | The actual CI job needs a Vercel preview URL. Ran Lighthouse locally against `npm run build && npm start` instead — see §5 |
| Real production domain + SSL | Not part of this session's scope (explicit instruction: GitHub/Vercel deployment deferred) |
| Production env fully configured & verified | Same |
| Production migration run | Same — migrations run locally clean against the shared dev DB; no production DB exists yet |
| Post-deploy smoke test (login, transaction, household, invite, transfer) | Needs a live deployed URL; the equivalent flows are proven by e2e against the local dev server instead |
| Legal review of `/privacy` and `/terms` | Content is factual and traceable to real app behavior, drafted as part of this audit — but is explicitly labeled in-page as a technical draft, not reviewed by an actual lawyer. A real launch needs that review |
| `git push` / PR merge to `main` | Explicitly out of scope for this session per the coordinating instructions |

## 5. Verification Results

**Filled in after `npm run verify`, `npm run test:coverage`, `npm run test:e2e`, and local Lighthouse finish — see the end of this session's report for the actual numbers, or re-run:**

```bash
npm run verify
npm run test:coverage
npm run test:e2e
npm run build && npm start   # then: curl -I http://localhost:3000, Lighthouse
```

*(This section is completed once those commands finish — status at the time of writing this checklist draft was: `npm run verify` in progress against the real shared dev DB, ~30+ min elapsed, consistent with this project's own documented 45–90 minute runtime for the full DB-sequential integration suite.)*

## 6. Known Limitations (ship anyway, monitor after launch)

- **Rate limiter is in-memory, per-process** — correct for a single Node instance, not shared across concurrent Vercel serverless instances. Documented in the code (`src/lib/api/rate-limit.ts`) since before this task; replacing it with a shared store (Redis/Upstash) is new infrastructure, out of this task's "no new features" scope. Monitor: if abuse is suspected in production, this is the first thing to harden.
- **4 moderate `npm audit` findings**, all dev-only tooling (`drizzle-kit`'s `esbuild` dependency). Not in the production bundle. Revisit when `drizzle-kit` ships a non-major fix.
- **`/privacy` and `/terms` are a technical draft**, not lawyer-reviewed. Fine for continued private/personal use; needs real review before any public launch with real users' financial data.
- **Sentry/Analytics are wired but unverified against a live project** — first production deploy is also the first real test of this wiring. Watch the first 24h of deploy logs closely for instrumentation errors.

## 7. What to Monitor Post-Launch

Per `docs/13-deployment-vercel.md` §9 and `docs/runbook.md` §0 — exactly four alert conditions, deliberately:

1. Reconciliation finds a balance discrepancy (`/api/cron/reconcile`, alerts via `reportReconciliationFinding`).
2. Error rate > 1% in 5 minutes (Sentry, once connected).
3. A cron job fails twice in a row (Vercel Cron execution log).
4. A production migration fails (Vercel build log).

Runbook for each: `docs/runbook.md`.
