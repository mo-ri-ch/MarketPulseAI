"use client";

import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Poll cadence in ms. Backend caches for ~8s so this is fine.
const POLL_MS = 10_000;

interface IndexData {
  name: string;
  symbol: string;
  value: number;
  prev_close: number;
  change: number;
  change_pct: number;
  up: boolean;
  spark: number[];
  stale?: boolean;
}

interface IndicesResponse {
  as_of: string;
  indices: IndexData[];
}

const FALLBACK: IndexData[] = [
  { name: "NIFTY 50",   symbol: "^NSEI",      value: 0, prev_close: 0, change: 0, change_pct: 0, up: true,  spark: [] },
  { name: "SENSEX",     symbol: "^BSESN",     value: 0, prev_close: 0, change: 0, change_pct: 0, up: true,  spark: [] },
  { name: "BANK NIFTY", symbol: "^NSEBANK",   value: 0, prev_close: 0, change: 0, change_pct: 0, up: false, spark: [] },
  { name: "NIFTY IT",   symbol: "^CNXIT",     value: 0, prev_close: 0, change: 0, change_pct: 0, up: true,  spark: [] },
  { name: "NIFTY MID",  symbol: "^NSEMDCP50", value: 0, prev_close: 0, change: 0, change_pct: 0, up: true,  spark: [] },
  { name: "VIX",        symbol: "^INDIAVIX",  value: 0, prev_close: 0, change: 0, change_pct: 0, up: false, spark: [] },
];

function formatValue(v: number): string {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function formatChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}`;
}

/** Build an SVG path string from a series of numbers, normalized into a box. */
function buildSparkPath(values: number[], width: number, height: number, pad = 2): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  return values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * innerW;
      const y = pad + (1 - (v - min) / range) * innerH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildSparkArea(values: number[], width: number, height: number, pad = 2): string {
  if (values.length < 2) return "";
  const line = buildSparkPath(values, width, height, pad);
  return `${line} L${(width - pad).toFixed(2)},${(height - pad).toFixed(2)} L${pad.toFixed(2)},${(height - pad).toFixed(2)} Z`;
}

interface CardProps {
  idx: IndexData;
  flash: "up" | "down" | null;
}

function IndexCard({ idx, flash }: CardProps) {
  const color = idx.up ? "var(--green)" : "var(--red)";
  const sparkW = 110;
  const sparkH = 32;
  const gradientId = `spark-${idx.symbol.replace(/[^a-zA-Z0-9]/g, "")}`;
  const linePath = buildSparkPath(idx.spark, sparkW, sparkH);
  const areaPath = buildSparkArea(idx.spark, sparkW, sparkH);

  return (
    <div
      style={{
        flexShrink: 0,
        minWidth: 168,
        padding: "8px 14px 8px 14px",
        borderRadius: 8,
        background:
          flash === "up"
            ? "color-mix(in srgb, var(--green) 12%, transparent)"
            : flash === "down"
            ? "color-mix(in srgb, var(--red) 12%, transparent)"
            : "transparent",
        transition: "background-color 400ms ease",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: "0.04em", fontWeight: 500 }}>
          {idx.name}
        </div>
        {idx.stale && (
          <span title="Showing last known value" style={{ fontSize: 9, color: "var(--muted)", opacity: 0.6 }}>
            ●
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 15, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
          {formatValue(idx.value)}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 11, color, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
          <span>{formatChange(idx.change)}</span>
          <span style={{ marginLeft: 6, opacity: 0.85 }}>{formatPct(idx.change_pct)}</span>
        </div>

        {idx.spark.length >= 2 && (
          <svg width={sparkW} height={sparkH} style={{ display: "block", overflow: "visible" }}>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </div>
  );
}

export default function MarketSummary() {
  const [indices, setIndices] = useState<IndexData[]>(FALLBACK);
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [flash, setFlash] = useState<Record<string, "up" | "down" | null>>({});
  const prevValuesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(`${API}/market/indices`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as IndicesResponse;
        if (!alive) return;

        // Detect per-index price moves vs the previous tick → flash green/red.
        const nextFlash: Record<string, "up" | "down" | null> = {};
        for (const idx of data.indices) {
          const prev = prevValuesRef.current[idx.symbol];
          if (prev !== undefined && idx.value !== prev) {
            nextFlash[idx.symbol] = idx.value > prev ? "up" : "down";
          }
          prevValuesRef.current[idx.symbol] = idx.value;
        }

        setIndices(data.indices.length > 0 ? data.indices : FALLBACK);
        setAsOf(new Date(data.as_of));
        setConnected(true);

        if (Object.keys(nextFlash).length > 0) {
          setFlash((prev) => ({ ...prev, ...nextFlash }));
          // Clear the flash after the CSS transition finishes.
          setTimeout(() => {
            if (!alive) return;
            setFlash((prev) => {
              const cleared = { ...prev };
              for (const k of Object.keys(nextFlash)) cleared[k] = null;
              return cleared;
            });
          }, 900);
        }
      } catch {
        if (alive) setConnected(false);
      } finally {
        if (alive) timer = setTimeout(tick, POLL_MS);
      }
    };

    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "10px 24px",
        overflowX: "auto",
        transition: "border-color 0.2s ease",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingRight: 14,
          marginRight: 4,
          borderRight: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: connected ? "var(--green)" : "var(--muted)",
            boxShadow: connected ? "0 0 0 0 color-mix(in srgb, var(--green) 60%, transparent)" : "none",
            animation: connected ? "mp-live-pulse 1.6s ease-out infinite" : "none",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: connected ? "var(--green)" : "var(--muted)" }}>
            {connected ? "LIVE" : "OFFLINE"}
          </span>
          <span style={{ fontSize: 9.5, color: "var(--muted)" }}>
            {asOf ? asOf.toLocaleTimeString() : "—"}
          </span>
        </div>
      </div>

      {indices.map((idx) => (
        <IndexCard key={idx.symbol} idx={idx} flash={flash[idx.symbol] ?? null} />
      ))}

      <style>{`
        @keyframes mp-live-pulse {
          0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--green) 55%, transparent); }
          70%  { box-shadow: 0 0 0 6px color-mix(in srgb, var(--green) 0%, transparent); }
          100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--green) 0%, transparent); }
        }
      `}</style>
    </div>
  );
}
