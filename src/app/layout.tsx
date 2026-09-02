import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

// Inter Variable — subset latin, hanya varian variable, dimuat lewat
// next/font dengan display: swap (docs/07-design-system.md §5.2).
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MyMoney — Keuangan Pribadi',
  description: 'Kelola pemasukan, pengeluaran, aset, dan kekayaan bersih Anda.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MyMoney',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

// viewport-fit=cover wajib — tanpanya env(safe-area-inset-*) selalu 0
// (docs/07-design-system.md §11.1).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // data-scroll-behavior tells Next.js the `scroll-behavior: smooth` in
    // globals.css is deliberate (docs/07-design-system.md), silencing its
    // dev-mode warning — which was intermittently intercepting e2e clicks
    // via the dev overlay portal it renders alongside the message.
    <html
      lang="id"
      className={`${inter.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <body className="flex min-h-full flex-col">
        {/* App-wide — tasks/07-transactions-core/spec.md needs toast +
            "Urungkan" for save/void, reachable from the FAB which lives in
            AppShell (mounted for every authenticated route). Root, not
            AppShell, so signin/onboarding could use it too if they ever
            need to. */}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
