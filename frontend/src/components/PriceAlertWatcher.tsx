"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Bell, Volume2, VolumeX } from "lucide-react";
import { apiJson, isLoggedIn, AuthError } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ALERTS_POLL_MS = 30_000;
const QUOTES_POLL_MS = 10_000;
const TRIGGER_STATE_KEY = "priceAlertsTriggered";
const MUTED_KEY = "priceAlertsSoundMuted";
// The siren itself is ~1.6s long. Loop slightly slower so each iteration has
// a brief gap, like a real alarm-clock cadence.
const ALARM_LOOP_MS = 1800;

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

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    __priceAlertAudio?: AudioContext;
    AudioContext: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = w.AudioContext || w.webkitAudioContext;
  if (!Ctor) return null;
  if (!w.__priceAlertAudio) w.__priceAlertAudio = new Ctor();
  const ctx = w.__priceAlertAudio;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Synthesize a repeating alarm-clock-style siren via the Web Audio API.
 * Square waves + alternating high/low tones give it the urgent "wake up"
 * character, and the pattern is direction-aware so the same audio cue
 * doubles as a hint (above = higher band, below = lower band).
 *
 * Browsers block AudioContext creation until a user gesture; we cache the
 * context on `window` so the first user click unlocks it for later auto-plays.
 */
function playAlarm(side: "above" | "below") {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    // Six alternating tones ≈ 1.6 s — long enough to grab attention but not
    // so long it loops past the toast settling on screen.
    const [hi, lo] = side === "above" ? [988, 740] : [523, 392]; // B5/F#5 vs C5/G4
    const toneSec = 0.22;
    const gapSec = 0.05;
    const step = toneSec + gapSec;
    for (let i = 0; i < 6; i++) {
      const freq = i % 2 === 0 ? hi : lo;
      const start = now + i * step;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square"; // harsher, alarm-like timbre
      osc.frequency.setValueAtTime(freq, start);
      // Punchy attack, sustained body, short release — like a buzzer.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.28, start + 0.012);
      gain.gain.setValueAtTime(0.28, start + toneSec - 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + toneSec);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + toneSec + 0.02);
    }
  } catch {
    // Audio not available — silently fall back to visual-only.
  }
}

/** Short single chirp used only to confirm an unmute action. */
function playConfirm() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const start = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.15, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.14);
  } catch {
    // ignore
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
 *
 * Sound:
 *   - The siren loops as long as at least one on-screen toast is still
 *     being violated by the live price (i.e. price is still above its
 *     "above" threshold, or still below its "below" threshold).
 *   - It falls silent automatically when every on-screen toast's price has
 *     returned inside its band — the toasts stay as a visual record.
 *   - It also stops immediately on a mute click or when every toast is
 *     dismissed.
 */
export default function PriceAlertWatcher() {
  const [authed, setAuthed] = useState(false);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [muted, setMuted] = useState(false);
  const triggerRef = useRef<TriggerState>({});
  const mutedRef = useRef(false);
  const toastIdRef = useRef(1);
  // Continuous-alarm bookkeeping. The loop keeps blasting the siren every
  // ALARM_LOOP_MS while at least one on-screen toast is still violating its
  // threshold per the latest quote; mute or dismiss-all also stops it.
  const alarmTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSideRef = useRef<"above" | "below">("above");
  // Most recent quote snapshot, kept in a ref so the loop's "is anything
  // still out of band?" check stays cheap and doesn't tie into React's
  // render cycle.
  const lastQuotesRef = useRef<Record<string, Quote>>({});
  const alertsRef = useRef<PriceAlert[]>([]);
  const toastsRef = useRef<Toast[]>([]);

  // Keep refs synced so callbacks captured by setInterval / setTimeout see
  // the latest data without us having to re-create the interval.
  useEffect(() => { alertsRef.current = alerts; }, [alerts]);
  useEffect(() => { toastsRef.current = toasts; }, [toasts]);

  const stopAlarmLoop = useCallback(() => {
    if (alarmTimerRef.current) {
      clearInterval(alarmTimerRef.current);
      alarmTimerRef.current = null;
    }
  }, []);

  /**
   * True when at least one on-screen toast's underlying threshold is still
   * being violated by the most recent quote. If a toast lingers but the
   * price has returned inside the band, this returns false so the siren
   * goes quiet (the toast itself stays as a visual record).
   */
  const isAnyConditionActive = useCallback((): { active: boolean; side: "above" | "below" | null } => {
    const ts = toastsRef.current;
    if (ts.length === 0) return { active: false, side: null };
    const quotes = lastQuotesRef.current;
    const alerts = alertsRef.current;
    let activeSide: "above" | "below" | null = null;
    for (const t of ts) {
      const a = alerts.find((x) => x.ticker === t.ticker);
      const q = quotes[t.ticker];
      if (!a || !q) continue;
      if (t.side === "above" && a.above != null && q.value >= a.above) {
        activeSide = "above";
        // Keep iterating in case a later toast is "below" and would update
        // the directional hint to the most-recent direction.
      } else if (t.side === "below" && a.below != null && q.value <= a.below) {
        activeSide = "below";
      }
    }
    return { active: activeSide !== null, side: activeSide };
  }, []);

  const startAlarmLoop = useCallback(() => {
    if (mutedRef.current) return;
    if (alarmTimerRef.current) return;
    const { active, side } = isAnyConditionActive();
    if (!active) return;
    if (side) lastSideRef.current = side;
    // First blast immediately so the user hears something the instant the
    // toast appears — the interval handles every loop after that.
    playAlarm(lastSideRef.current);
    alarmTimerRef.current = setInterval(() => {
      if (mutedRef.current) {
        stopAlarmLoop();
        return;
      }
      const { active: stillActive, side: currentSide } = isAnyConditionActive();
      if (!stillActive) {
        // Price has returned inside the band for every on-screen toast — go
        // quiet. The toast stays so the user can see what happened.
        stopAlarmLoop();
        return;
      }
      if (currentSide) lastSideRef.current = currentSide;
      playAlarm(lastSideRef.current);
    }, ALARM_LOOP_MS);
  }, [isAnyConditionActive, stopAlarmLoop]);

  // Pick up auth state once on mount. The login flow does a full page nav so a
  // remount is enough to re-evaluate.
  useEffect(() => {
    setAuthed(isLoggedIn());
    triggerRef.current = loadTriggerState();
    const m = localStorage.getItem(MUTED_KEY) === "1";
    setMuted(m);
    mutedRef.current = m;
  }, []);

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    try {
      localStorage.setItem(MUTED_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
    if (next) {
      // Mute click is the user's explicit "stop the racket" gesture.
      stopAlarmLoop();
    } else {
      playConfirm();
      // If there are still active toasts, resume the looping siren —
      // unmute should re-arm the alarm, not just allow future events.
      if (toasts.length > 0) startAlarmLoop();
    }
  };

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
          const quotes = data.quotes || {};
          // Stash for the alarm loop's "still out of band?" probe.
          lastQuotesRef.current = quotes;
          evaluate(quotes);
          // If a previously-violating toast's price has just returned inside
          // the band, hush the siren without waiting for the next loop tick.
          if (alarmTimerRef.current) {
            const { active } = isAnyConditionActive();
            if (!active) stopAlarmLoop();
          }
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
        // Remember the most recent direction so the looping siren can vary
        // its pitch when fresh crossings stack on top of older toasts.
        lastSideRef.current = newToasts[newToasts.length - 1].side;
        // Continuous alarm — the loop keeps the siren going until the user
        // mutes or dismisses every toast.
        startAlarmLoop();
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
    setToasts((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      // Keep the ref in sync synchronously so the active-state probe below
      // doesn't see the about-to-be-removed toast.
      toastsRef.current = remaining;
      const { active } = isAnyConditionActive();
      if (!active) stopAlarmLoop();
      return remaining;
    });

  // Cleanly stop the interval when the watcher unmounts (e.g. logout).
  useEffect(() => stopAlarmLoop, [stopAlarmLoop]);

  const hasArmed = alerts.some((a) => a.above != null || a.below != null);
  if (!authed || (!hasArmed && toasts.length === 0)) return null;

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
        alignItems: "flex-end",
      }}
    >
      {hasArmed && (
        <button
          onClick={toggleMute}
          title={muted ? "Unmute alert sound" : "Mute alert sound"}
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            width: 30,
            height: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: muted ? "var(--muted)" : "var(--fg)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
          }}
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      )}
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
