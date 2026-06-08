"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Bell } from "lucide-react";
import { apiJson, isLoggedIn, AuthError } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ALERTS_POLL_MS = 30_000;
const QUOTES_POLL_MS = 10_000;
const TRIGGER_STATE_KEY = "priceAlertsTriggered";

interface PriceAlert {
  ticker: string;
  above: number | null;
  below: number | null;
}

interface Quote {
  ticker: string;
  value: number;
  change: number;
  change_pct: number;
  up: boolean;
}

interface Toast {
  id: number;
  ticker: string;
  side: "above" | "below";
  threshold: number;
  price: number;
  at: number;
}

type TriggerSide = { triggered: boolean };
type TriggerState = Record<string, { above: TriggerSide; below: TriggerSide }>;

function loadTriggerState(): TriggerState {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(TRIGGER_STATE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveTriggerState(s: TriggerState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TRIGGER_STATE_KEY, JSON.stringify(s));
  } catch {
    // ignore quota errors
  }
}

/**
 * Global watcher: polls the user's per-stock thresholds + live quotes and
 * renders dismissable toasts whenever a stock's price crosses one of its
 * configured boundaries. Lives in the root layout so the alerts stay visible
 * regardless of which page the user is on.
 *
 * Re-trigger semantics:
 *   - Each (ticker, side) latches once it fires — the toast does not repeat
 *     every poll while the price stays out-of-band.
 *   - The latch clears as soon as the price returns inside the band, so the
 *     next crossing re-alerts.
 *   - Latch state is persisted to localStorage so navigation doesn't reset it.
 */
export default function PriceAlertWatcher() {
  const [authed, setAuthed] = useState(false);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const triggerRef = useRef<TriggerState>({});
  const toastIdRef = useRef(1);

  // Pick up auth state once on mount. The login flow does a full page nav so a
  // remount is enough to re-evaluate.
  useEffect(() => {
    setAuthed(isLoggedIn());
    triggerRef.current = loadTriggerState();
  }, []);

  // Poll the user's configured alerts. Only one in-flight request at a time.
  const fetchAlerts = useCallback(async () => {
    if (!isLoggedIn()) return;
    try {
      const data = await apiJson<PriceAlert[]>("/price-alerts");
      setAlerts(data);
    } catch (e) {
      if (e instanceof AuthError) {
        setAuthed(false);
      }
      // network blip — keep last known list
    }
  }, []);

  useEffect(() => {
    if (!authed) {
      setAlerts([]);
      return;
    }
    fetchAlerts();
    const t = setInterval(fetchAlerts, ALERTS_POLL_MS);
    // Also refresh on focus so a freshly-added alert lights up quickly.
    const onFocus = () => fetchAlerts();
    window.addEventListener("focus", onFocus);
    // Cross-tab: when settings change in another tab, re-pull.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "priceAlertsDirty") fetchAlerts();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [authed, fetchAlerts]);

  // Build a stable tickers-key so the quote polling effect only restarts when
  // the watched set actually changes.
  const watched = alerts.filter(
    (a) => a.above !== null || a.below !== null,
  );
  const tickersKey = watched.map((a) => a.ticker).sort().join(",");

  useEffect(() => {
    if (!tickersKey) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(
          `${API}/market/quotes?tickers=${encodeURIComponent(tickersKey)}`,
          { cache: "no-store" },
        );
        if (res.ok && alive) {
          const data = (await res.json()) as { quotes: Record<string, Quote> };
          evaluate(data.quotes || {});
        }
      } catch {
        // ignore — try again next tick
      } finally {
        if (alive) timer = setTimeout(tick, QUOTES_POLL_MS);
      }
    };

    const evaluate = (quotes: Record<string, Quote>) => {
      const next = { ...triggerRef.current };
      const newToasts: Toast[] = [];

      for (const a of alerts) {
        const q = quotes[a.ticker];
        if (!q) continue;
        const state = next[a.ticker] || { above: { triggered: false }, below: { triggered: false } };

        // Above threshold
        if (a.above !== null) {
          if (q.value >= a.above && !state.above.triggered) {
            newToasts.push({
              id: toastIdRef.current++,
              ticker: a.ticker,
              side: "above",
              threshold: a.above,
              price: q.value,
              at: Date.now(),
            });
            state.above = { triggered: true };
          } else if (q.value < a.above && state.above.triggered) {
            state.above = { triggered: false };
          }
        } else {
          state.above = { triggered: false };
        }

        // Below threshold
        if (a.below !== null) {
          if (q.value <= a.below && !state.below.triggered) {
            newToasts.push({
              id: toastIdRef.current++,
              ticker: a.ticker,
              side: "below",
              threshold: a.below,
              price: q.value,
              at: Date.now(),
            });
            state.below = { triggered: true };
          } else if (q.value > a.below && state.below.triggered) {
            state.below = { triggered: false };
          }
        } else {
          state.below = { triggered: false };
        }

        next[a.ticker] = state;
      }

      // Drop trigger entries for tickers the user no longer watches.
      const watchedSet = new Set(alerts.map((a) => a.ticker));
      for (const t of Object.keys(next)) {
        if (!watchedSet.has(t)) delete next[t];
      }

      triggerRef.current = next;
      saveTriggerState(next);

      if (newToasts.length > 0) {
        setToasts((prev) => [...prev, ...newToasts]);
        // Best-effort browser notification — works if the page is in another tab.
        if (typeof window !== "undefined" && "Notification" in window) {
          if (Notification.permission === "granted") {
            for (const t of newToasts) {
              new Notification(
                `${t.ticker} ${t.side === "above" ? "above" : "below"} ₹${t.threshold}`,
                { body: `Now ₹${t.price.toLocaleString("en-IN")}` },
              );
            }
          }
        }
      }
    };

    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey, alerts]);

  // Ask once for notification permission so background-tab alerts work.
  useEffect(() => {
    if (!authed) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [authed]);

  const dismiss = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  if (!authed || toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 70,
        right: 20,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 340,
      }}
    >
      {toasts.map((t) => {
        const isAbove = t.side === "above";
        const accent = isAbove ? "#22c55e" : "#ef4444";
        return (
          <div
            key={t.id}
            style={{
              background: "var(--bg)",
              color: "var(--fg)",
              border: `1px solid ${accent}`,
              borderLeft: `4px solid ${accent}`,
              borderRadius: 8,
              padding: "10px 12px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              animation: "priceAlertSlideIn 0.25s ease-out",
            }}
          >
            <Bell size={16} style={{ color: accent, flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>
              <div style={{ fontWeight: 700 }}>
                {t.ticker} {isAbove ? "crossed above" : "dropped below"} ₹
                {t.threshold.toLocaleString("en-IN")}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                Now ₹{t.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--muted)",
                padding: 2,
                display: "flex",
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes priceAlertSlideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
