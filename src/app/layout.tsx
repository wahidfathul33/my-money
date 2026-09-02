import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
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
    <html lang="id" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
