'use client';

/**
 * Registers `/sw.js` — docs/13-deployment-vercel.md §8, todo.md: "Registrasi
 * di layout.tsx, hanya di produksi." Production-only and gated on browser
 * support so `next dev`'s own hot-reload/fast-refresh never fights a stale
 * cached module, and older/non-supporting browsers never see the (harmless
 * but pointless) failed-registration console noise.
 */
import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Best-effort — a failed registration degrades to "no offline cache",
      // never to a broken app (docs/10-ux-states.md §7 is about the CACHED
      // read/blocked-write behavior, not about the worker existing).
    });
  }, []);

  return null;
}
