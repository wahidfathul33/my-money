import type { NextConfig } from 'next';

// Security headers — docs/12-security-and-auth.md §12. `Referrer-Policy`
// matters specifically because of invitation links (task 10): without it, a
// token embedded in a URL can leak via the `Referer` header when the
// recipient clicks an outbound link from the invitation page.
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
      "connect-src 'self'",
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

export default nextConfig;
