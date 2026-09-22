'use client';

/**
 * docs/10-ux-states.md §7 / tasks/22-settings-sharing-pwa: "Offline, membuka
 * aplikasi → tampilkan data ter-cache + banner 'Offline — data per
 * {waktu}'." Mounted once in `<AppShell>` so it's visible on every
 * authenticated route. Auto-hides the instant the browser reports back
 * online, and refreshes the current route at that moment ("data
 * disegarkan otomatis") — the service worker's own network-first cache is
 * what served the stale data while offline; a fresh Server Component render
 * is what replaces it once the network is back.
 */
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/lib/pwa/network-status';

function formatTime(epochMs: number): string {
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(epochMs));
}

export function OfflineBanner() {
  const { isOnline, lastOnlineAt, isSlow } = useNetworkStatus();
  const router = useRouter();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      router.refresh();
    }
  }, [isOnline, router]);

  if (isOnline && !isSlow) return null;

  return (
    <div
      role="status"
      className="bg-warning-subtle text-warning-readable flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium"
    >
      <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
      {isOnline ? 'Koneksi lambat…' : `Offline — data per ${lastOnlineAt ? formatTime(lastOnlineAt) : '—'}`}
    </div>
  );
}
