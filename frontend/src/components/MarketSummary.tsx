"use client";

import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Poll cadence in ms. Backend caches for ~1.5s so every other tick hits a
// fresh Yahoo response, giving near-real-time updates without hammering it.
const POLL_MS = 2_000;

interface IndexData {
  name: string;
  symbol: string;
  value: number;
  prev_close: number;
  change: number;
  change_pct: number;
  up: boolean;
  spark: number[];
  spark_ts?: number[]; // unix seconds for each spark point
  stale?: boolean;
}

interface IndicesResponse {
  as_of: string;
  indices: IndexData[];
}

const FALLBACK: IndexData[] = [
  { name: "NIFTY 50",   symbol: "^NSEI",      value: 0, prev_close: 0, change: 0, change_pct: 0, up: true,  spark: [], spark_ts: [] },
  { name: "SENSEX",     symbol: "^BSESN",     value: 0, prev_close: 0, change: 0, change_pct: 0, up: true,  spark: [], spark_ts: [] },
  { name: "BANK NIFTY", symbol: "^NSEBANK",   value: 0, prev_close: 0, change: 0, change_pct: 0, up: false, spark: [], spark_ts: [] },
  { name: "NIFTY IT",   symbol: "^CNXIT",     value: 0, prev_close: 0, change: 0, change_pct: 0, up: true,  spark: [], spark_ts: [] },
  { name: "NIFTY MID",  symbol: "^NSEMDCP50", value: 0, prev_close: 0, change: 0, change_pct: 0, up: true,  spark: [], spark_ts: [] },
  { name: "VIX",        symbol: "^INDIAVIX",  value: 0, prev_close: 0, change: 0, change_pct: 0, up: false, spark: [], spark_ts: [] },
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
const SPARK_PAD = 1.5;

interface SparkPoint { x: number; y: number; }

function computePoints(values: number[]): SparkPoint[] {
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = SPARK_VB_W - SPARK_PAD * 2;
  const innerH = SPARK_VB_H - SPARK_PAD * 2;
  return values.map((v, i) => ({
    x: SPARK_PAD + (i / (values.length - 1)) * innerW,
    y: SPARK_PAD + (1 - (v - min) / range) * innerH,
  }));
}

function pointsToPath(points: SparkPoint[]): string {
  if (points.length < 2) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

function pointsToArea(points: SparkPoint[]): string {
  if (points.length < 2) return "";
  const line = pointsToPath(points);
  const right = (SPARK_VB_W - SPARK_PAD).toFixed(2);
  const left = SPARK_PAD.toFixed(2);
  const bottom = (SPARK_VB_H - SPARK_PAD).toFixed(2);
  return `${line} L${right},${bottom} L${left},${bottom} Z`;
}

function formatTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

interface CardProps {
  idx: IndexData;
  flash: "up" | "down" | null;
}

function IndexCard({ idx, flash }: CardProps) {
  const color = idx.up ? "var(--green)" : "var(--red)";
  const gradientId = `spark-${idx.symbol.replace(/[^a-zA-Z0-9]/g, "")}`;
  const points = computePoints(idx.spark);
  const linePath = pointsToPath(points);
  const areaPath = pointsToArea(points);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverPxX, setHoverPxX] = useState<number>(0);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || idx.spark.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const i = Math.round(ratio * (idx.spark.length - 1));
    setHoverIdx(i);
    // x in card-relative pixels for the tooltip — anchor to the actual data
    // point's x, not the cursor, so the tooltip snaps to the same bar the
    // crosshair line lives on.
    const dataRatio = i / (idx.spark.length - 1);
    const wrap = wrapRef.current;
    if (wrap) {
      const wrapRect = wrap.getBoundingClientRect();
      const dataPxX = (rect.left - wrapRect.left) + dataRatio * rect.width;
      setHoverPxX(dataPxX);
    }
  };

  const handleLeave = () => setHoverIdx(null);

  const hoverPoint = hoverIdx !== null ? points[hoverIdx] : null;
  const hoverValue = hoverIdx !== null ? idx.spark[hoverIdx] : null;
  const hoverTs = hoverIdx !== null ? idx.spark_ts?.[hoverIdx] : null;
  const hoverDelta = hoverValue !== null && idx.prev_close ? hoverValue - idx.prev_close : 0;
  const hoverDeltaPct = hoverValue !== null && idx.prev_close ? (hoverDelta / idx.prev_close) * 100 : 0;
  const hoverColor = hoverDelta >= 0 ? "var(--green)" : "var(--red)";

  return (
    <div
      ref={wrapRef}
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
        // overflow visible so the hover tooltip can sit above the spark
        // without being clipped by the card edges.
        overflow: "visible",
        position: "relative",
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
        <div style={{ position: "relative", width: "100%", marginTop: 2 }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SPARK_VB_W} ${SPARK_VB_H}`}
            preserveAspectRatio="none"
            onMouseMove={handleMove}
            onMouseLeave={handleLeave}
            style={{ display: "block", width: "100%", height: 20, cursor: "crosshair" }}
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
              vectorEffect="non-scaling-stroke"
            />
            {hoverPoint && (
              <>
                <line
                  x1={hoverPoint.x}
                  x2={hoverPoint.x}
                  y1={0}
                  y2={SPARK_VB_H}
                  stroke="var(--muted)"
                  strokeWidth={0.5}
                  strokeDasharray="1.2 1.2"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={hoverPoint.x}
                  cy={hoverPoint.y}
                  r={2.2}
                  fill="var(--bg)"
                  stroke={color}
                  strokeWidth={1.4}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
          </svg>

          {hoverIdx !== null && hoverValue !== null && (
            <div
              style={{
                position: "absolute",
                left: hoverPxX,
                bottom: "calc(100% + 6px)",
                transform: "translateX(-50%)",
                background: "var(--card)",
                color: "var(--fg)",
                border: "1px solid var(--card-border)",
                borderRadius: 6,
                padding: "5px 8px",
                fontSize: 10.5,
                lineHeight: 1.35,
                whiteSpace: "nowrap",
                boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
                pointerEvents: "none",
                zIndex: 30,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <div style={{ color: "var(--muted)", fontSize: 9.5, letterSpacing: "0.02em" }}>
                {hoverTs ? formatTime(hoverTs) : "—"}
              </div>
              <div style={{ fontWeight: 600, fontSize: 11.5 }}>{formatValue(hoverValue)}</div>
              <div style={{ color: hoverColor, fontSize: 10 }}>
                {formatChange(hoverDelta)} {formatPct(hoverDeltaPct)}
              </div>
            </div>
          )}
        </div>
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
          }, 600);
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
