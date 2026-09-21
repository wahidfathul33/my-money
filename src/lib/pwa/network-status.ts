'use client';

/**
 * PWA offline/slow-connection detection — docs/10-ux-states.md §7,
 * tasks/22-settings-sharing-pwa. `isOnline` tracks the browser's own
 * `online`/`offline` events (the same signal `navigator.onLine` exposes);
 * `lastOnlineAt` persists across reloads in `localStorage` so the offline
 * banner's "data per {waktu}" survives a page refresh taken while offline.
 *
 * `isSlow` reads the Network Information API (`navigator.connection`) —
 * `effectiveType` of `'slow-2g'`/`'2g'`, or a reported `downlink` under
 * 0.5 Mbps. An EARLIER version of this hook instead globally wrapped
 * `window.fetch` to time every in-flight request past 3s; that was reverted
 * after it measurably slowed down (and in one real run, broke the timing
 * of) Server Action round-trips elsewhere in the app — e2e/sharing.spec.ts's
 * `share_wealth` test started losing a pre-existing optimistic-UI-vs-DB-
 * commit race that had reliably passed before. A passive `navigator.connection`
 * READ can't add latency to anything, at the cost of Safari/iOS (which
 * doesn't implement the API) simply never showing this one message —
 * an acceptable trade for a nice-to-have hint, not the offline guarantee
 * itself.
 */
import { useEffect, useState } from 'react';

const LAST_ONLINE_KEY = 'mymoney:lastOnlineAt';

interface NetworkInformation extends EventTarget {
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
  downlink?: number;
}

function readIsSlow(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!connection) return false;
  if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') return true;
  if (typeof connection.downlink === 'number' && connection.downlink < 0.5) return true;
  return false;
}

export interface NetworkStatus {
  isOnline: boolean;
  /** Epoch ms of the last time the browser reported itself online, or
   * `null` if never recorded yet (e.g. very first load, still offline). */
  lastOnlineAt: number | null;
  isSlow: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  // Both start at the SAME value the server would produce (`true` / `null`)
  // — reading `navigator.onLine` or `localStorage` directly in a `useState`
  // initializer runs on the client's FIRST render too, not just effects, so
  // it can diverge from the server's render and trip a hydration mismatch
  // (confirmed against a real `next dev` run while building this hook).
  // The real values are synced in the effect below instead, which only
  // ever runs AFTER hydration completes — any resulting state flip is a
  // normal post-hydration re-render, never a mismatch.
  const [isOnline, setIsOnline] = useState(true);
  const [lastOnlineAt, setLastOnlineAt] = useState<number | null>(null);
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    function persistOnline() {
      const now = Date.now();
      setLastOnlineAt(now);
      window.localStorage.setItem(LAST_ONLINE_KEY, String(now));
    }
    function handleOnline() {
      setIsOnline(true);
      persistOnline();
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial sync, post-hydration: read the REAL current state once,
    // restoring any previously-persisted `lastOnlineAt` even if the
    // browser happens to be offline right now (so a reload taken while
    // offline still shows a meaningful "data per {waktu}" instead of "—").
    setIsOnline(navigator.onLine);
    const stored = window.localStorage.getItem(LAST_ONLINE_KEY);
    if (stored) setLastOnlineAt(Number(stored));
    if (navigator.onLine) persistOnline();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    setIsSlow(readIsSlow());
    if (!connection) return;

    function handleChange() {
      setIsSlow(readIsSlow());
    }
    connection.addEventListener('change', handleChange);
    return () => connection.removeEventListener('change', handleChange);
  }, []);

  return { isOnline, lastOnlineAt, isSlow };
}
