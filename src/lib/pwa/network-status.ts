'use client';

/**
 * PWA offline/slow-connection detection — docs/10-ux-states.md §7,
 * tasks/22-settings-sharing-pwa. `isOnline`/`isSlow` are both read via
 * `useSyncExternalStore` — the React-blessed pattern for subscribing to
 * external, mutable browser state (`navigator.onLine`,
 * `navigator.connection`) — rather than a manual `useEffect` + `setState`.
 * Two real bugs in an earlier manual-effect version motivated the switch:
 * (1) reading `navigator.onLine` in a `useState` initializer runs on the
 * client's FIRST render too, not just the server, and diverged from the
 * server's render enough to trip a real hydration mismatch (confirmed
 * against a `next dev` run); (2) syncing the real value via a plain
 * `setState` call in the effect BODY (not inside an event callback) trips
 * `eslint-plugin-react-hooks`'s `set-state-in-effect` rule — caught by
 * `npm run verify`, not by `typecheck` alone.
 * `useSyncExternalStore` sidesteps both: its server-snapshot argument
 * handles SSR correctly by construction, and subscribing is the intended
 * shape for exactly this kind of external store.
 *
 * `lastOnlineAt` persists across reloads in `localStorage` so the offline
 * banner's "data per {waktu}" survives a page refresh taken while offline —
 * it's a plain `useState` + a listener effect (permitted: the `setState`
 * calls there run INSIDE the 'online' event callback, not synchronously in
 * the effect body), not an external-store subscription, since nothing else
 * ever mutates it out from under this hook.
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
import { useEffect, useState, useSyncExternalStore } from 'react';

const LAST_ONLINE_KEY = 'mymoney:lastOnlineAt';

interface NetworkInformation extends EventTarget {
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
  downlink?: number;
}

function getConnection(): NetworkInformation | undefined {
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}
function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}
function getOnlineServerSnapshot(): boolean {
  return true; // no signal server-side — assume online, matches every other tz/DEFAULT_TIMEZONE-style fallback in this codebase
}

function subscribeConnection(callback: () => void): () => void {
  const connection = getConnection();
  if (!connection) return () => {};
  connection.addEventListener('change', callback);
  return () => connection.removeEventListener('change', callback);
}
function getIsSlowSnapshot(): boolean {
  const connection = getConnection();
  if (!connection) return false;
  if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') return true;
  if (typeof connection.downlink === 'number' && connection.downlink < 0.5) return true;
  return false;
}
function getIsSlowServerSnapshot(): boolean {
  return false;
}

export interface NetworkStatus {
  isOnline: boolean;
  /** Epoch ms of the last time the browser reported itself online, or
   * `null` if never recorded yet (e.g. very first load, still offline). */
  lastOnlineAt: number | null;
  isSlow: boolean;
}

function readStoredLastOnlineAt(): number | null {
  if (typeof window === 'undefined') return null; // SSR guard — no localStorage server-side
  const stored = window.localStorage.getItem(LAST_ONLINE_KEY);
  return stored ? Number(stored) : null;
}

export function useNetworkStatus(): NetworkStatus {
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getOnlineServerSnapshot);
  const isSlow = useSyncExternalStore(subscribeConnection, getIsSlowSnapshot, getIsSlowServerSnapshot);

  // A LAZY INITIALIZER, not a value read inside an effect body — the
  // `set-state-in-effect` hazard this whole hook was rewritten to avoid
  // only applies to `setState` calls made FROM an effect; an initializer
  // function passed to `useState` isn't an effect at all. Hydration-safe
  // for the same reason `isOnline`'s value is: `<OfflineBanner>` only ever
  // reads `lastOnlineAt` inside the `!isOnline` branch, and `isOnline` is
  // guaranteed to equal the server snapshot (`true`) on the render pass
  // that must match server output — so whatever this returns can never
  // actually reach the DOM during that window either way.
  const [lastOnlineAt, setLastOnlineAt] = useState<number | null>(readStoredLastOnlineAt);

  useEffect(() => {
    function handleOnline() {
      const now = Date.now();
      setLastOnlineAt(now);
      window.localStorage.setItem(LAST_ONLINE_KEY, String(now));
    }
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  return { isOnline, lastOnlineAt, isSlow };
}
