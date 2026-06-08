"use client";

import { useEffect, useRef, useState } from "react";
import { publishQuote } from "@/lib/quoteStore";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const POLL_MS = 2_000;

interface ChartData {
  name: string;
  symbol: string;
  value: number;
  prev_close: number;
  change: number;
  change_pct: number;
  up: boolean;
  spark: number[];
  spark_ts: number[];
}

interface Props {
  ticker: string;
}

const VB_W = 1000;
const VB_H = 220;
const PAD_L = 8;
const PAD_R = 56; // room for the right-edge y-axis labels
const PAD_T = 14;
const PAD_B = 22;

interface Pt { x: number; y: number; }

function computePoints(values: number[]): { pts: Pt[]; min: number; max: number } {
  if (values.length < 2) return { pts: [], min: 0, max: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = VB_W - PAD_L - PAD_R;
  const innerH = VB_H - PAD_T - PAD_B;
  const pts = values.map((v, i) => ({
    x: PAD_L + (i / (values.length - 1)) * innerW,
    y: PAD_T + (1 - (v - min) / range) * innerH,
  }));
  return { pts, min, max };
}

function pointsToPath(pts: Pt[]): string {
  return pts.length < 2 ? "" : pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

function pointsToArea(pts: Pt[]): string {
  if (pts.length < 2) return "";
  const line = pointsToPath(pts);
  const bottom = (VB_H - PAD_B).toFixed(2);
  return `${line} L${pts[pts.length - 1].x.toFixed(2)},${bottom} L${pts[0].x.toFixed(2)},${bottom} Z`;
}

function formatValue(v: number): string {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime(unixSec: number, withSeconds = true): string {
  return new Date(unixSec * 1000).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false,
  });
}

export default function StockChart({ ticker }: Props) {
  const [data, setData] = useState<ChartData | null>(null);
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState<Date | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverPxX, setHoverPxX] = useState<number>(0);
  const prevValueRef = useRef<number | null>(null);
  const [priceFlash, setPriceFlash] = useState<"up" | "down" | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // 1Hz wall clock for the LIVE timestamp.
  useEffect(() => {
    setClock(new Date());
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll the chart endpoint. Re-runs when ticker changes.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setData(null);
    prevValueRef.current = null;

    const tick = async () => {
      try {
        const res = await fetch(`${API}/market/chart?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { chart: ChartData | null };
        if (!alive) return;
        if (json.chart) {
          // Flash the price chip on every tick that moves the value.
          const prev = prevValueRef.current;
          if (prev !== null && json.chart.value !== prev) {
            const dir = json.chart.value > prev ? "up" : "down";
            setPriceFlash(dir);
            setTimeout(() => alive && setPriceFlash(null), 700);
          }
          prevValueRef.current = json.chart.value;
          setData(json.chart);
          setConnected(true);
          // Broadcast the chart's authoritative value so any alert toast or
          // popover for the same ticker shows exactly this number.
          publishQuote(json.chart.name, {
            value: json.chart.value,
            change: json.chart.change,
            change_pct: json.chart.change_pct,
            up: json.chart.up,
            source: "chart",
          });
        } else {
          setConnected(false);
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
  }, [ticker]);

  if (!data) {
    return (
      <div
        style={{
          padding: 20,
          borderRadius: 10,
          border: "1px solid var(--border)",
          minHeight: 260,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted)",
          fontSize: 12,
        }}
      >
        Loading live chart for {ticker}…
      </div>
    );
  }

  const color = data.up ? "var(--green)" : "var(--red)";
  const gradientId = `chart-grad-${data.symbol.replace(/[^a-zA-Z0-9]/g, "")}`;
  const { pts, min, max } = computePoints(data.spark);
  const linePath = pointsToPath(pts);
  const areaPath = pointsToArea(pts);

  const dayOpen = data.spark[0] ?? data.prev_close;
  const dayHigh = data.spark.length ? Math.max(...data.spark) : data.value;
  const dayLow = data.spark.length ? Math.min(...data.spark) : data.value;

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || data.spark.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const i = Math.round(ratio * (data.spark.length - 1));
    setHoverIdx(i);
    const wrap = wrapRef.current;
    if (wrap) {
      const wrapRect = wrap.getBoundingClientRect();
      const dataRatio = i / (data.spark.length - 1);
      const innerLeftPx = rect.left - wrapRect.left + (PAD_L / VB_W) * rect.width;
      const innerWidthPx = ((VB_W - PAD_L - PAD_R) / VB_W) * rect.width;
      setHoverPxX(innerLeftPx + dataRatio * innerWidthPx);
    }
  };

  const handleLeave = () => setHoverIdx(null);

  const hoverPoint = hoverIdx !== null ? pts[hoverIdx] : null;
  const hoverValue = hoverIdx !== null ? data.spark[hoverIdx] : null;
  const hoverTs = hoverIdx !== null ? data.spark_ts?.[hoverIdx] : null;
  const hoverDelta = hoverValue !== null ? hoverValue - data.prev_close : 0;
  const hoverDeltaPct = hoverValue !== null && data.prev_close ? (hoverDelta / data.prev_close) * 100 : 0;
  const hoverColor = hoverDelta >= 0 ? "var(--green)" : "var(--red)";

  // Right-edge price axis: 4 evenly-spaced labels between min and max.
  const yLabels: { y: number; v: number }[] = [];
  if (pts.length >= 2) {
    const steps = 4;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const v = max - t * (max - min);
      const y = PAD_T + t * (VB_H - PAD_T - PAD_B);
      yLabels.push({ y, v });
    }
  }

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        padding: "14px 16px 10px",
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--card)",
      }}
    >
      {/* Header: price + change + LIVE clock */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 26,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.01em",
              padding: "2px 6px",
              borderRadius: 4,
              transition: "background-color 400ms ease",
              background:
                priceFlash === "up"
                  ? "color-mix(in srgb, var(--green) 18%, transparent)"
                  : priceFlash === "down"
                  ? "color-mix(in srgb, var(--red) 18%, transparent)"
                  : "transparent",
            }}
          >
            ₹{formatValue(data.value)}
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {data.change >= 0 ? "+" : ""}
            {data.change.toFixed(2)} ({data.change >= 0 ? "+" : ""}
            {data.change_pct.toFixed(2)}%)
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: connected ? "var(--green)" : "var(--muted)",
              animation: connected ? "stock-pulse 1.6s ease-out infinite" : "none",
            }}
          />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: connected ? "var(--green)" : "var(--muted)" }}>
            {connected ? "LIVE" : "OFFLINE"}
          </span>
          <span style={{ fontSize: 11, color: "var(--muted)", fontVariantNumeric: "tabular-nums", marginLeft: 2 }}>
            {clock ? clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "--:--:--"}
          </span>
        </div>
      </div>

      {/* Day stats */}
      <div style={{ display: "flex", gap: 18, fontSize: 11, color: "var(--muted)", marginBottom: 8, flexWrap: "wrap" }}>
        <span>Open <span style={{ color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>₹{formatValue(dayOpen)}</span></span>
        <span>High <span style={{ color: "var(--green)", fontVariantNumeric: "tabular-nums" }}>₹{formatValue(dayHigh)}</span></span>
        <span>Low <span style={{ color: "var(--red)", fontVariantNumeric: "tabular-nums" }}>₹{formatValue(dayLow)}</span></span>
        <span>Prev close <span style={{ color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>₹{formatValue(data.prev_close)}</span></span>
      </div>

      {/* Chart */}
      {pts.length >= 2 ? (
        <div style={{ position: "relative", width: "100%" }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            onMouseMove={handleMove}
            onMouseLeave={handleLeave}
            style={{ display: "block", width: "100%", height: 220, cursor: "crosshair" }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Horizontal grid lines (one per Y label) */}
            {yLabels.map((l, i) => (
              <line
                key={i}
                x1={PAD_L}
                x2={VB_W - PAD_R}
                y1={l.y}
                y2={l.y}
                stroke="var(--border)"
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* Previous-close reference line */}
            {pts.length >= 2 && data.prev_close >= min && data.prev_close <= max && (() => {
              const range = max - min || 1;
              const innerH = VB_H - PAD_T - PAD_B;
              const y = PAD_T + (1 - (data.prev_close - min) / range) * innerH;
              return (
                <line
                  x1={PAD_L}
                  x2={VB_W - PAD_R}
                  y1={y}
                  y2={y}
                  stroke="var(--muted)"
                  strokeWidth={0.6}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.6}
                />
              );
            })()}

            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />

            {/* Y-axis labels on the right edge */}
            {yLabels.map((l, i) => (
              <text
                key={`yl-${i}`}
                x={VB_W - PAD_R + 4}
                y={l.y + 3}
                fontSize={9}
                fill="var(--muted)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatValue(l.v)}
              </text>
            ))}

            {/* X-axis: start/end time labels */}
            {data.spark_ts && data.spark_ts.length >= 2 && (
              <>
                <text x={PAD_L} y={VB_H - 6} fontSize={9} fill="var(--muted)">
                  {formatTime(data.spark_ts[0], false)}
                </text>
                <text x={VB_W - PAD_R} y={VB_H - 6} fontSize={9} fill="var(--muted)" textAnchor="end">
                  {formatTime(data.spark_ts[data.spark_ts.length - 1], false)}
                </text>
              </>
            )}

            {/* Hover crosshair + marker */}
            {hoverPoint && (
              <>
                <line
                  x1={hoverPoint.x}
                  x2={hoverPoint.x}
                  y1={PAD_T}
                  y2={VB_H - PAD_B}
                  stroke="var(--muted)"
                  strokeWidth={0.6}
                  strokeDasharray="2 2"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={hoverPoint.x}
                  cy={hoverPoint.y}
                  r={3}
                  fill="var(--bg)"
                  stroke={color}
                  strokeWidth={1.6}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
          </svg>

          {/* Floating tooltip anchored to the hovered bar's X */}
          {hoverIdx !== null && hoverValue !== null && (
            <div
              style={{
                position: "absolute",
                left: hoverPxX,
                top: -4,
                transform: "translate(-50%, -100%)",
                background: "var(--card)",
                color: "var(--fg)",
                border: "1px solid var(--card-border)",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 11,
                lineHeight: 1.4,
                whiteSpace: "nowrap",
                boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
                pointerEvents: "none",
                zIndex: 30,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <div style={{ color: "var(--muted)", fontSize: 10 }}>{hoverTs ? formatTime(hoverTs) : "—"}</div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>₹{formatValue(hoverValue)}</div>
              <div style={{ color: hoverColor }}>
                {hoverDelta >= 0 ? "+" : ""}
                {hoverDelta.toFixed(2)} ({hoverDelta >= 0 ? "+" : ""}
                {hoverDeltaPct.toFixed(2)}%)
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
          No intraday data available yet — markets may be closed.
        </div>
      )}

      <style>{`
        @keyframes stock-pulse {
          0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--green) 55%, transparent); }
          70%  { box-shadow: 0 0 0 6px color-mix(in srgb, var(--green) 0%, transparent); }
          100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--green) 0%, transparent); }
        }
      `}</style>
    </div>
  );
}
