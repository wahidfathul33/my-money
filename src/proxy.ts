/**
 * Layer 1 authorization — docs/12-security-and-auth.md §3.
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (docs/11-tech-architecture.md
 * §2, node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 * "Migration to Proxy") — same file, same behavior, exported function
 * renamed from `middleware` to `proxy`.
 *
 * `auth` re-exported directly (not wrapped) so Next.js calls it as
 * `auth(request, event)`, which Auth.js's `initAuth` recognizes as the
 * "middleware.ts inline" call shape (see node_modules/next-auth/lib/index.js)
 * and drives entirely off `callbacks.authorized` in src/lib/auth/options.ts
 * — including the automatic redirect to `pages.signIn` with `callbackUrl`
 * set, so that logic isn't duplicated here.
 *
 * IMPORTANT: this protects PAGES. It does not protect Server Actions — a
 * matcher change here silently stops covering a route's actions too (see
 * the proxy.md file-convention doc above). `requireUser()`
 * (src/lib/auth/require-user.ts) is what every Server Action and route
 * handler must call regardless of what this file matches.
 */
export { auth as proxy } from '@/lib/auth';

export const config = {
  // Adds `/kitchen-sink` on top of tasks/04-authentication/spec.md's exact
  // list (`api/auth`, `api/cron`, `signin`, `invite`) — it's task 01's
  // design-system showcase page: no user data, no auth surface, and its own
  // e2e suite (e2e/kitchen-sink.spec.ts) depends on unauthenticated access.
  //
  // `api/health` (task 23, docs/13-deployment-vercel.md §9) is excluded for
  // the same reason as `api/cron`: an external uptime checker carries no
  // user session and can't be made to. It reports only `{ status, db }`
  // regardless — see src/app/api/health/route.ts's own doc comment.
  //
  // `privacy`/`terms` (task 23, "Audit Legal") must be readable before
  // sign-in — src/app/(auth)/signin/page.tsx links both from its own
  // unauthenticated screen.
  matcher: [
    '/((?!api/auth|api/cron|api/health|signin|invite|privacy|terms|kitchen-sink|_next|favicon.ico).*)',
  ],
};
