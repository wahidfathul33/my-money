'use client';

/**
 * PWA offline/slow-connection detection — docs/10-ux-states.md §7,
 * tasks/22-settings-sharing-pwa. `isOnline` tracks the browser's own
 * `online`/`offline` events (the same signal `navigator.onLine` exposes);
 * `lastOnlineAt` persists across reloads in `localStorage` so the offline
 * banner's "data per {waktu}" survives a page refresh taken while offline.
 * `isSlow` is a generic heuristic — ANY in-flight `fetch()` (Server Actions
 * included, which use `fetch` under the hood) still pending past 3s flips it
 * on, no per-call-site opt-in needed.
 */
import { useEffect, useState } from 'react';

const LAST_ONLINE_KEY = 'mymoney:lastOnlineAt';
const SLOW_THRESHOLD_MS = 3000;

export interface NetworkStatus {
  isOnline: boolean;
  /** Epoch ms of the last time the browser reported itself online, or
   * `null` if never recorded yet (e.g. very first load, still offline). */
  lastOnlineAt: number | null;
  isSlow: boolean;
}

function readStoredLastOnlineAt(): number | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(LAST_ONLINE_KEY);
  return stored ? Number(stored) : null;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [lastOnlineAt, setLastOnlineAt] = useState<number | null>(readStoredLastOnlineAt);
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
    if (navigator.onLine) persistOnline();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    const originalFetch = window.fetch.bind(window);
    let pending = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function startTimer() {
      if (timer) return;
      timer = setTimeout(() => setIsSlow(true), SLOW_THRESHOLD_MS);
    }
    function clearTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    window.fetch = ((...args: Parameters<typeof fetch>) => {
      pending += 1;
      startTimer();
      return originalFetch(...args).finally(() => {
        pending = Math.max(0, pending - 1);
        if (pending === 0) {
          clearTimer();
          setIsSlow(false);
        }
      });
    }) as typeof fetch;

    return () => {
      window.fetch = originalFetch;
      clearTimer();
    };
  }, []);

  return { isOnline, lastOnlineAt, isSlow };
}
