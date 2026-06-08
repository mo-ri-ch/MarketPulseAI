"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, Volume2, X } from "lucide-react";
import { apiJson, AuthError } from "@/lib/api";
import { playAlarm } from "./PriceAlertWatcher";
import { publishQuote, useQuote } from "@/lib/quoteStore";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
// 1 s so the popover's "Current ₹…" matches whatever the chart and the
// watchlist row are showing as the user dials in their threshold.
const POP_QUOTE_POLL_MS = 1_000;

interface Props {
  ticker: string;
  currentPrice?: number;
}

interface Threshold {
  ticker: string;
  above: number | null;
  below: number | null;
}

export default function PriceAlertSettings({ ticker, currentPrice }: Props) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState<string>("");
  const [below, setBelow] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<Threshold>({ ticker, above: null, below: null });
  // Local fallback used until the shared store has a value. The store is the
  // primary source of truth so the popover stays in lock-step with whatever
  // the chart is showing for the same ticker.
  const [localPrice, setLocalPrice] = useState<number | undefined>(currentPrice);
  const popRef = useRef<HTMLDivElement | null>(null);
  const storeSnap = useQuote(ticker);
  const livePrice = storeSnap?.value ?? localPrice;

  // Keep the local fallback in sync with the parent's prop whenever the
  // popover is closed (so opening it later starts from the freshest known
  // value before the popover's own poll lands).
  useEffect(() => {
    if (!open && currentPrice !== undefined) setLocalPrice(currentPrice);
  }, [currentPrice, open]);

  // Initial fetch of just this ticker's current thresholds (so the bell can
  // show "armed" state without making the row open the popover first).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await apiJson<Threshold[]>("/price-alerts");
        if (cancelled) return;
        const mine = list.find((a) => a.ticker.toUpperCase() === ticker.toUpperCase());
        if (mine) setActive({ ticker, above: mine.above, below: mine.below });
      } catch (e) {
        if (e instanceof AuthError) return;
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [ticker]);

  // Sync inputs when opening the popover.
  useEffect(() => {
    if (open) {
      setAbove(active.above != null ? String(active.above) : "");
      setBelow(active.below != null ? String(active.below) : "");
      setErr(null);
    }
  }, [open, active]);

  // While open, hammer the quote endpoint on a short interval so the user
  // sees the price move in real time as they think about a threshold.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(
          `${API}/market/quotes?tickers=${encodeURIComponent(ticker)}`,
          { cache: "no-store" },
        );
        if (res.ok && alive) {
          const data = (await res.json()) as {
            quotes: Record<string, { value: number; change?: number; change_pct?: number; up?: boolean }>;
          };
          const q = data.quotes?.[ticker];
          if (q && typeof q.value === "number") {
            // Push into the shared store so the toast (and any chart) for
            // this ticker see the same number we're about to display.
            publishQuote(ticker, {
              value: q.value,
              change: q.change,
              change_pct: q.change_pct,
              up: q.up,
              source: "popover-poll",
            });
            setLocalPrice(q.value);
          }
        }
      } catch {
        // Keep showing the last value on network blips.
      } finally {
        if (alive) timer = setTimeout(tick, POP_QUOTE_POLL_MS);
      }
    };

    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [open, ticker]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const parsedAbove = above.trim() ? Number(above) : null;
  const parsedBelow = below.trim() ? Number(below) : null;

  const save = async () => {
    setErr(null);
    if (parsedAbove !== null && Number.isNaN(parsedAbove)) {
      setErr("Above must be a number");
      return;
    }
    if (parsedBelow !== null && Number.isNaN(parsedBelow)) {
      setErr("Below must be a number");
      return;
    }
    if (parsedAbove !== null && parsedBelow !== null && parsedBelow >= parsedAbove) {
      setErr("Below must be less than Above");
      return;
    }
    setSaving(true);
    try {
      const res = await apiJson<Threshold>(`/price-alerts/${encodeURIComponent(ticker)}`, {
        method: "PUT",
        body: JSON.stringify({ above: parsedAbove, below: parsedBelow }),
      });
      setActive({ ticker, above: res.above, below: res.below });
      // Nudge the global watcher (and other tabs) to re-pull.
      localStorage.setItem("priceAlertsDirty", String(Date.now()));
      setOpen(false);
    } catch (e: any) {
      if (e instanceof AuthError) return;
      setErr(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    setErr(null);
    try {
      await apiJson(`/price-alerts/${encodeURIComponent(ticker)}`, { method: "DELETE" });
      setActive({ ticker, above: null, below: null });
      setAbove("");
      setBelow("");
      localStorage.setItem("priceAlertsDirty", String(Date.now()));
      setOpen(false);
    } catch (e: any) {
      if (e instanceof AuthError) return;
      setErr(e.message || "Failed to clear");
    } finally {
      setSaving(false);
    }
  };

  const armed = loaded && (active.above != null || active.below != null);
  const Icon = armed ? BellRing : Bell;

  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={
          armed
            ? `Alert: ${active.above != null ? `> ₹${active.above}` : ""}${active.above != null && active.below != null ? " · " : ""}${active.below != null ? `< ₹${active.below}` : ""}`
            : "Set price alert"
        }
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: armed ? "#f59e0b" : "var(--muted)",
          padding: 0,
          display: "flex",
        }}
      >
        <Icon size={12} />
      </button>

      {open && (
        <div
          ref={popRef}
          style={{
            position: "absolute",
            top: 22,
            right: 0,
            zIndex: 100,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 12,
            width: 220,
            boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)" }}>
              {ticker} alert
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 0, display: "flex" }}
            >
              <X size={12} />
            </button>
          </div>

          {livePrice != null && (
            <div
              style={{
                fontSize: 11,
                color: "var(--muted)",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#22c55e",
                  display: "inline-block",
                  animation: "priceAlertLiveDot 1.4s ease-in-out infinite",
                }}
              />
              Current ₹{livePrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              <style>{`
                @keyframes priceAlertLiveDot {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.35; }
                }
              `}</style>
            </div>
          )}

          <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
            Notify if price goes above
          </label>
          <input
            type="number"
            inputMode="decimal"
            placeholder="e.g. 1500"
            value={above}
            onChange={(e) => setAbove(e.target.value)}
            style={{
              width: "100%", padding: "6px 8px", fontSize: 12,
              border: "1px solid var(--border)", borderRadius: 4,
              background: "var(--bg)", color: "var(--fg)", outline: "none",
              boxSizing: "border-box", marginBottom: 8,
            }}
          />

          <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
            Notify if price goes below
          </label>
          <input
            type="number"
            inputMode="decimal"
            placeholder="e.g. 1200"
            value={below}
            onChange={(e) => setBelow(e.target.value)}
            style={{
              width: "100%", padding: "6px 8px", fontSize: 12,
              border: "1px solid var(--border)", borderRadius: 4,
              background: "var(--bg)", color: "var(--fg)", outline: "none",
              boxSizing: "border-box", marginBottom: 10,
            }}
          />

          {err && (
            <p style={{ fontSize: 11, color: "#ef4444", margin: "0 0 8px 0" }}>{err}</p>
          )}

          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{
                flex: 1, fontSize: 12, fontWeight: 600, padding: "6px 0",
                background: "var(--fg)", color: "var(--bg)",
                border: "none", borderRadius: 4, cursor: "pointer",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {armed && (
              <button
                onClick={clear}
                disabled={saving}
                style={{
                  fontSize: 12, padding: "6px 10px", background: "none",
                  border: "1px solid var(--border)", borderRadius: 4,
                  cursor: "pointer", color: "var(--muted)",
                }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Audio smoke-test — the click itself is a user gesture so this
              also primes the browser's AudioContext for later auto-fires. */}
          <button
            onClick={() => playAlarm("above")}
            title="Play the alarm once to confirm sound is working"
            style={{
              marginTop: 8, width: "100%", fontSize: 11,
              padding: "5px 8px",
              background: "none", color: "var(--muted)",
              border: "1px dashed var(--border)", borderRadius: 4,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <Volume2 size={11} /> Test sound
          </button>
        </div>
      )}
    </div>
  );
}
