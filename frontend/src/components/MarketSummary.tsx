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

const SPARK_VB_W = 100;
const SPARK_VB_H = 22;

function buildSparkPath(values: number[], width = SPARK_VB_W, height = SPARK_VB_H, pad = 1.5): string {
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

function buildSparkArea(values: number[], width = SPARK_VB_W, height = SPARK_VB_H, pad = 1.5): string {
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
  const gradientId = `spark-${idx.symbol.replace(/[^a-zA-Z0-9]/g, "")}`;
  const linePath = buildSparkPath(idx.spark);
  const areaPath = buildSparkArea(idx.spark);

  return (
    <div
      style={{
        // Equal-share width so all six cards fit the viewport without scrolling.
        flex: "1 1 0",
        minWidth: 0,
        padding: "6px 10px",
        borderRadius: 6,
        background:
          flash === "up"
            ? "color-mix(in srgb, var(--green) 14%, transparent)"
            : flash === "down"
            ? "color-mix(in srgb, var(--red) 14%, transparent)"
            : "transparent",
        transition: "background-color 400ms ease",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <div
          style={{
            fontSize: 10,
            color: "var(--muted)",
            letterSpacing: "0.04em",
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {idx.name}
        </div>
        {idx.stale && (
          <span title="Showing last known value" style={{ fontSize: 9, color: "var(--muted)", opacity: 0.6 }}>
            ●
          </span>
        )}
      </div>

      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
        }}
      >
        {formatValue(idx.value)}
      </div>

      <div
        style={{
          fontSize: 10.5,
          color,
          fontVariantNumeric: "tabular-nums",
          fontWeight: 500,
          display: "flex",
          gap: 5,
          whiteSpace: "nowrap",
        }}
      >
        <span>{formatChange(idx.change)}</span>
        <span style={{ opacity: 0.85 }}>{formatPct(idx.change_pct)}</span>
      </div>

      {idx.spark.length >= 2 && (
        <svg
          viewBox={`0 0 ${SPARK_VB_W} ${SPARK_VB_H}`}
          preserveAspectRatio="none"
          style={{ display: "block", width: "100%", height: 20, marginTop: 2 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            // Non-scaling so the line stays crisp under preserveAspectRatio="none".
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  );
}

export default function MarketSummary() {
  const [indices, setIndices] = useState<IndexData[]>(FALLBACK);
  const [connected, setConnected] = useState<boolean>(false);
  const [flash, setFlash] = useState<Record<string, "up" | "down" | null>>({});
  const [clock, setClock] = useState<Date | null>(null);
  const prevValuesRef = useRef<Record<string, number>>({});

  // Real-time clock — ticks every second independent of the poll loop.
  useEffect(() => {
    setClock(new Date());
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(`${API}/market/indices`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as IndicesResponse;
        if (!alive) return;

        const nextFlash: Record<string, "up" | "down" | null> = {};
        for (const idx of data.indices) {
          const prev = prevValuesRef.current[idx.symbol];
          if (prev !== undefined && idx.value !== prev) {
            nextFlash[idx.symbol] = idx.value > prev ? "up" : "down";
          }
          prevValuesRef.current[idx.symbol] = idx.value;
        }

        setIndices(data.indices.length > 0 ? data.indices : FALLBACK);
        setConnected(true);

        if (Object.keys(nextFlash).length > 0) {
          setFlash((prev) => ({ ...prev, ...nextFlash }));
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

  const clockText = clock
    ? clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : "--:--:--";

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "stretch",
        gap: 4,
        padding: "8px 16px",
        overflow: "hidden",
        transition: "border-color 0.2s ease",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingRight: 12,
          marginRight: 6,
          borderRight: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: connected ? "var(--green)" : "var(--muted)",
              animation: connected ? "mp-live-pulse 1.6s ease-out infinite" : "none",
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: connected ? "var(--green)" : "var(--muted)",
            }}
          >
            {connected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
        <div
          title="IST clock"
          style={{
            fontSize: 12,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            color: "var(--fg)",
            letterSpacing: "0.02em",
          }}
        >
          {clockText}
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
