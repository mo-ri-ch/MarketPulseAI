/**
 * Tiny in-memory pub/sub store for live per-ticker prices.
 *
 * The motivation is to keep the value shown in the chart, the alert toasts,
 * and the per-stock alert popover in lock-step. Each polling site publishes
 * here on every fresh fetch; everyone else subscribes and renders the most
 * recently published snapshot. Whichever source has the freshest data wins.
 *
 * State lives at the module level so the store survives navigation within
 * the SPA without needing a React context.
 */
import { useSyncExternalStore } from "react";

export interface QuoteSnapshot {
  value: number;
  change?: number;
  change_pct?: number;
  up?: boolean;
  /** ms since epoch when this snapshot was published. */
  at: number;
  /** Optional debug tag — "chart", "watcher-poll", "popover-poll" etc. */
  source?: string;
}

const snapshots = new Map<string, QuoteSnapshot>();
const listeners = new Set<() => void>();
// A monotonically-increasing version stamp so useSyncExternalStore's
// `getSnapshot` returns a primitive that changes on every publish — Map
// identity alone wouldn't trigger React to re-render.
let version = 0;

function notify() {
  version += 1;
  for (const l of listeners) l();
}

export function publishQuote(
  ticker: string,
  snap: Omit<QuoteSnapshot, "at"> & { at?: number },
) {
  const key = ticker.toUpperCase();
  snapshots.set(key, { ...snap, at: snap.at ?? Date.now() });
  notify();
}

export function publishQuotes(
  entries: Record<string, Omit<QuoteSnapshot, "at"> & { at?: number }>,
) {
  const now = Date.now();
  for (const [t, s] of Object.entries(entries)) {
    snapshots.set(t.toUpperCase(), { ...s, at: s.at ?? now });
  }
  notify();
}

export function getQuoteSnapshot(ticker: string): QuoteSnapshot | undefined {
  return snapshots.get(ticker.toUpperCase());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React hook that re-renders on every publish. */
export function useQuoteVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}

/** Convenience: subscribe and read one ticker's snapshot in render. */
export function useQuote(ticker: string): QuoteSnapshot | undefined {
  useQuoteVersion();
  return getQuoteSnapshot(ticker);
}
