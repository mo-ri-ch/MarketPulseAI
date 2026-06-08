"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Bell, Volume2, VolumeX } from "lucide-react";
import { apiJson, isLoggedIn, AuthError } from "@/lib/api";
import {
  getQuoteSnapshot,
  publishQuotes,
  useQuoteVersion,
} from "@/lib/quoteStore";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ALERTS_POLL_MS = 30_000;
// 1 s so the toast's "Now ₹…" line and the siren's out-of-band check track
// the market as tightly as the chart does.
const QUOTES_POLL_MS = 1_000;
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

// `at` records the threshold value at the time we latched. If the user later
// changes the threshold, the stored value no longer matches the current one
// and the latch is treated as cleared — so the freshly-saved threshold can
// fire even if the previous one was still considered "active".
type TriggerSide = { triggered: boolean; at: number | null };
type TriggerState = Record<string, { above: TriggerSide; below: TriggerSide }>;

// Trigger latches used to live in localStorage to dedupe alerts across page
// navigations, but persisting "already triggered" turned out to defeat the
// user's expectation that opening the page with an active out-of-band
// condition should immediately re-alert. We now keep the latch in memory
// only — refreshing the page is a clean slate, so every still-violating
// threshold fires a fresh toast on load. The localStorage entry (if any)
// from a previous build is cleared on first mount so it can't sneak back.
const _legacyClear = () => {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(TRIGGER_STATE_KEY); } catch { /* ignore */ }
};

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
 * Browsers block AudioContext playback until the page has seen a real user
 * gesture. Wire up a one-shot listener so the very first click, key press,
 * or touch creates+resumes the context — afterwards every auto-fired alarm
 * (which has no gesture of its own) can play without the autoplay policy
 * silently swallowing it.
 */
const AUDIO_UNLOCK_FLAG = "__priceAlertAudioUnlocked";
const AUDIO_UNLOCK_EVENT = "priceAlertAudioUnlocked";

export function isAudioUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as Record<string, unknown>)[AUDIO_UNLOCK_FLAG]);
}

/** Resume the AudioContext and mark it as unlocked. Idempotent. */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  if (w[AUDIO_UNLOCK_FLAG]) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    // ignore
  }
  w[AUDIO_UNLOCK_FLAG] = true;
  // Tell the watcher to drop its "audio blocked" banner and immediately
  // play whatever alarm is currently meant to be sounding.
  window.dispatchEvent(new CustomEvent(AUDIO_UNLOCK_EVENT));
}

export function installAudioUnlock() {
  if (typeof window === "undefined") return;
  if (isAudioUnlocked()) return;
  const handler = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
    window.removeEventListener("touchstart", handler);
  };
  window.addEventListener("pointerdown", handler, { once: false });
  window.addEventListener("keydown", handler, { once: false });
  window.addEventListener("touchstart", handler, { once: false });
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
export function playAlarm(side: "above" | "below") {
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
 *   - Each (ticker, side, threshold) latches once it fires — the toast does
 *     not repeat every poll while the price stays out-of-band.
 *   - The latch clears as soon as the price returns inside the band, OR when
 *     the user edits the threshold (we key the latch by threshold value).
 *   - Latches are session-only — refreshing the page wipes them so any
 *     still-violating threshold fires a fresh toast on load.
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
  // Latest quote per ticker, mirrored from lastQuotesRef so toast bodies can
  // re-render with the freshest "Now ₹…" value on every poll instead of
  // freezing at the trigger-time snapshot. Also picks up the shared store's
  // version so re-renders fire whenever the chart publishes a fresher value.
  const [liveQuotes, setLiveQuotes] = useState<Record<string, Quote>>({});
  const storeVersion = useQuoteVersion();
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(() => isAudioUnlocked());
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
   *
   * Prefers the shared quoteStore (which the chart updates at ~2s) over
   * the watcher's slower 10s poll so the siren reacts to the freshest tick.
   */
  const isAnyConditionActive = useCallback((): { active: boolean; side: "above" | "below" | null } => {
    const ts = toastsRef.current;
    if (ts.length === 0) return { active: false, side: null };
    const fallback = lastQuotesRef.current;
    const alerts = alertsRef.current;
    let activeSide: "above" | "below" | null = null;
    for (const t of ts) {
      const a = alerts.find((x) => x.ticker === t.ticker);
      if (!a) continue;
      const fresh = getQuoteSnapshot(t.ticker);
      const value = fresh?.value ?? fallback[t.ticker]?.value;
      if (value == null) continue;
      if (t.side === "above" && a.above != null && value >= a.above) {
        activeSide = "above";
      } else if (t.side === "below" && a.below != null && value <= a.below) {
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

  // Whenever the shared quoteStore bumps (e.g. the chart published a fresher
  // tick), re-check whether the alarm should still be sounding. This lets
  // the siren react to the chart's 2s cadence instead of waiting for the
  // watcher's own 10s poll to notice the price has normalised.
  useEffect(() => {
    if (!alarmTimerRef.current) return;
    const { active } = isAnyConditionActive();
    if (!active) stopAlarmLoop();
  }, [storeVersion, isAnyConditionActive, stopAlarmLoop]);

  // Pick up auth state once on mount. The login flow does a full page nav so a
  // remount is enough to re-evaluate.
  useEffect(() => {
    setAuthed(isLoggedIn());
    // Start with a fresh in-memory latch on every page load so any still-
    // violating threshold immediately fires a toast, even if the same
    // threshold had fired in an earlier session.
    triggerRef.current = {};
    _legacyClear();
    const m = localStorage.getItem(MUTED_KEY) === "1";
    setMuted(m);
    mutedRef.current = m;
    // Audio is silently blocked by the browser until the user has interacted
    // with the page. Wire up a one-shot unlock so the first click anywhere
    // primes the AudioContext for later automatic alarms.
    installAudioUnlock();
  }, []);

  // Drop the "click to enable sound" banner the moment audio unlocks, and
  // immediately (re-)play the alarm if a toast was already begging for it.
  useEffect(() => {
    const onUnlock = () => {
      setAudioUnlocked(true);
      if (toastsRef.current.length > 0 && !mutedRef.current) {
        stopAlarmLoop();
        startAlarmLoop();
      }
    };
    window.addEventListener("priceAlertAudioUnlocked", onUnlock);
    return () => window.removeEventListener("priceAlertAudioUnlocked", onUnlock);
  }, [startAlarmLoop, stopAlarmLoop]);

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
    // Same-tab: the storage event doesn't fire for the writing tab, so the
    // popover dispatches a CustomEvent the watcher can pick up immediately
    // after a save/clear so the new threshold takes effect on the next tick.
    const onDirty = () => fetchAlerts();
    window.addEventListener("priceAlertsDirty", onDirty);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("priceAlertsDirty", onDirty);
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
          // Stash for the alarm loop's "still out of band?" probe, and
          // mirror into state so live "Now ₹…" lines in toasts re-render.
          lastQuotesRef.current = quotes;
          setLiveQuotes(quotes);
          // Broadcast into the shared store so any visible chart for the
          // same ticker stays in sync — and so the chart's faster 2s ticks
          // can override this slower 10s value in the toast.
          publishQuotes(
            Object.fromEntries(
              Object.entries(quotes).map(([t, q]) => [
                t,
                {
                  value: q.value,
                  change: q.change,
                  change_pct: q.change_pct,
                  up: q.up,
                  source: "watcher-poll",
                },
              ]),
            ),
          );
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
      // Every fresh crossing (price was inside the band on the previous tick,
      // out of band on this one) — even when dedup keeps us from pushing a
      // second toast. The alarm fires on any fresh crossing, so it restarts
      // when the price dips out → in → out again.
      const freshSides: ("above" | "below")[] = [];

      // Dedup helper: skip pushing a fresh toast if an identical one is
      // already on screen for the same (ticker, side, threshold). The price
      // inside that toast will update via liveQuotes, so a second card adds
      // nothing. The alarm, however, still fires (see freshSides).
      const existing = toastsRef.current;
      const alreadyShown = (
        ticker: string,
        side: "above" | "below",
        threshold: number,
      ) =>
        existing.some(
          (x) => x.ticker === ticker && x.side === side && x.threshold === threshold,
        );

      for (const a of alerts) {
        const q = quotes[a.ticker];
        if (!q) continue;
        const state = next[a.ticker] || {
          above: { triggered: false, at: null },
          below: { triggered: false, at: null },
        };

        // A latch is considered active only if it was recorded against the
        // SAME threshold value we're currently checking. Threshold edits
        // invalidate the latch so the new value can fire immediately.
        const aboveLatched = state.above.triggered && state.above.at === a.above;
        const belowLatched = state.below.triggered && state.below.at === a.below;

        // Above threshold
        if (a.above !== null) {
          if (q.value >= a.above && !aboveLatched) {
            if (!alreadyShown(a.ticker, "above", a.above)) {
              newToasts.push({
                id: toastIdRef.current++,
                ticker: a.ticker,
                side: "above",
                threshold: a.above,
                price: q.value,
                at: Date.now(),
              });
            }
            state.above = { triggered: true, at: a.above };
            freshSides.push("above");
          } else if (q.value < a.above && state.above.triggered) {
            state.above = { triggered: false, at: null };
          }
        } else {
          state.above = { triggered: false, at: null };
        }

        // Below threshold
        if (a.below !== null) {
          if (q.value <= a.below && !belowLatched) {
            if (!alreadyShown(a.ticker, "below", a.below)) {
              newToasts.push({
                id: toastIdRef.current++,
                ticker: a.ticker,
                side: "below",
                threshold: a.below,
                price: q.value,
                at: Date.now(),
              });
            }
            state.below = { triggered: true, at: a.below };
            freshSides.push("below");
          } else if (q.value > a.below && state.below.triggered) {
            state.below = { triggered: false, at: null };
          }
        } else {
          state.below = { triggered: false, at: null };
        }

        next[a.ticker] = state;
      }

      // Drop trigger entries for tickers the user no longer watches.
      const watchedSet = new Set(alerts.map((a) => a.ticker));
      for (const t of Object.keys(next)) {
        if (!watchedSet.has(t)) delete next[t];
      }

      triggerRef.current = next;

      // Push any new toasts into state. We sync toastsRef synchronously so
      // the alarm-start path below sees the fresh list immediately, before
      // React's render-driven effect catches up.
      if (newToasts.length > 0) {
        toastsRef.current = [...toastsRef.current, ...newToasts];
        setToasts((prev) => [...prev, ...newToasts]);
      }

      // Any fresh crossing restarts the looping siren — even if dedup kept
      // the toast itself singular. That way the user gets noise back when a
      // stock re-exits the safe band after returning to it briefly.
      if (freshSides.length > 0) {
        lastSideRef.current = freshSides[freshSides.length - 1];
        startAlarmLoop();
        // Browser notifications only fire for genuinely new toasts so we
        // don't spam the OS notification centre on every re-cross.
        if (newToasts.length > 0 && typeof window !== "undefined" && "Notification" in window) {
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
      {hasArmed && !audioUnlocked && (
        <button
          onClick={unlockAudio}
          title="Click to enable alarm sound on this page"
          style={{
            background: "#f59e0b",
            color: "#000",
            border: "none",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 8px 24px rgba(245,158,11,0.35)",
            animation: "priceAlertSlideIn 0.25s ease-out",
          }}
        >
          <Volume2 size={14} /> Click to enable alarm sound
        </button>
      )}
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
        // Read from the shared quoteStore first — the chart publishes there
        // at its faster cadence, keeping this number in lock-step with
        // whatever the chart is showing. Falls back to the watcher's own
        // 10s poll if no fresher value exists.
        const storeSnap = getQuoteSnapshot(t.ticker);
        const livePrice = storeSnap?.value ?? liveQuotes[t.ticker]?.value ?? t.price;
        // Outline tracks the LIVE condition, not the trigger event:
        //   green  → price is still on the wrong side of the threshold
        //            (the alarm condition is currently being violated)
        //   red    → price has returned inside the band, situation cleared
        const isCurrentlyViolating = isAbove
          ? livePrice >= t.threshold
          : livePrice <= t.threshold;
        const accent = isCurrentlyViolating ? "#22c55e" : "#ef4444";
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
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  marginTop: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: accent,
                    display: "inline-block",
                    animation: "priceAlertToastDot 1.4s ease-in-out infinite",
                  }}
                />
                Now ₹{livePrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
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
        @keyframes priceAlertToastDot {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
