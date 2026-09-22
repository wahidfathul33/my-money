import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

// Security headers — docs/12-security-and-auth.md §12. `Referrer-Policy`
// matters specifically because of invitation links (task 10): without it, a
// token embedded in a URL can leak via the `Referer` header when the
// recipient clicks an outbound link from the invitation page.
//
// `connect-src` carries two task-23 additions beyond docs/12 §12's original
// list: Sentry's ingest endpoint (error/session reporting — no-ops today
// since NEXT_PUBLIC_SENTRY_DSN is unset, see src/lib/observability/sentry.ts)
// and Vercel's Web Vitals beacon for Speed Insights/Analytics. Both are
// inert without a deployed Vercel/Sentry project; they're here now so
// nothing needs touching at deploy time.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://lh3.googleusercontent.com",
      "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://vitals.vercel-insights.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // The dev-mode route indicator overlay sits on top of the desktop
  // sidebar's "+ Tambah" button and swallows its clicks (confirmed via
  // Playwright's own action log: "<nextjs-portal> ... intercepts pointer
  // events") — reproduced 3/3 in isolation. Dev-only cosmetic feature, safe
  // to disable; doesn't affect production.
  devIndicators: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

// `withSentryConfig` wires source-map upload at build time — inert without
// `SENTRY_AUTH_TOKEN` (it logs a notice and skips upload, it does not fail
// the build; verified locally via `npm run build`). `org`/`project` are
// intentionally read from optional env vars rather than hardcoded: this
// environment has no Sentry project, so there is nothing real to name yet.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: false,
  disableLogger: true,
});
