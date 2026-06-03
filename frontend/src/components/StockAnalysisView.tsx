"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  "NSE India":         { bg: "rgba(59,130,246,0.12)", text: "#60a5fa" },
  "Moneycontrol":      { bg: "rgba(249,115,22,0.12)", text: "#fb923c" },
  "Reuters":           { bg: "rgba(239,68,68,0.12)",  text: "#f87171" },
  "TradingView":       { bg: "rgba(14,165,233,0.12)", text: "#38bdf8" },
  "Motilal Oswal":     { bg: "rgba(168,85,247,0.12)", text: "#c084fc" },
  "Yahoo Finance":     { bg: "rgba(139,92,246,0.12)", text: "#a78bfa" },
  "Economic Times":    { bg: "rgba(234,179,8,0.12)",  text: "#facc15" },
  "LiveMint":          { bg: "rgba(16,185,129,0.12)", text: "#34d399" },
  "Business Standard": { bg: "rgba(6,182,212,0.12)",  text: "#22d3ee" },
  "CNBC TV18":         { bg: "rgba(244,63,94,0.12)",  text: "#fb7185" },
  "Reddit":            { bg: "rgba(234,88,12,0.12)",  text: "#f97316" },
  "FrontPage":         { bg: "rgba(20,184,166,0.12)", text: "#2dd4bf" },
  "Google News":       { bg: "rgba(99,102,241,0.12)", text: "#818cf8" },
};
const DEFAULT_SOURCE = { bg: "rgba(100,116,139,0.12)", text: "#94a3b8" };

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

interface Props {
  ticker: string;
  onBack: () => void;
}

export default function StockAnalysisView({ ticker, onBack }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`${API}/stocks/${ticker}/analysis`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch stock analysis.");
        return res.json();
      })
      .then((json) => { if (active) setData(json); })
      .catch((err) => { if (active) setError(err.message || "Unexpected error"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ticker]);

  const dirInfo = (() => {
    const d = data?.prediction?.direction?.toUpperCase();
    if (d === "UP")   return { Icon: TrendingUp,   label: "Bullish", color: "#22c55e", bg: "rgba(34,197,94,0.12)" };
    if (d === "DOWN") return { Icon: TrendingDown, label: "Bearish", color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
    return { Icon: Minus, label: "Neutral", color: "#eab308", bg: "rgba(234,179,8,0.12)" };
  })();
  const confidencePct = Math.round((data?.prediction?.confidence ?? 0.5) * 100);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "1px solid var(--border)",
            borderRadius: 6, padding: "5px 10px", cursor: "pointer",
            color: "var(--muted)", fontSize: 12, fontWeight: 500,
            transition: "all 0.2s ease",
          }}
        >
          <ArrowLeft size={13} /> All news
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)", margin: 0 }}>
            {data?.company_name || ticker}
          </h2>
          <span style={{
            fontSize: 10, fontWeight: 600, fontFamily: "monospace",
            padding: "2px 6px", borderRadius: 4,
            background: "var(--border)", color: "var(--muted)",
          }}>
            {ticker}
          </span>
        </div>
      </div>

      {/* Loading / error */}
      {loading && (
        <div style={{ padding: "40px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <Loader2 size={20} style={{ color: "var(--muted)", animation: "spin 1s linear infinite" }} />
          <p style={{ fontSize: 12, color: "var(--muted)" }}>Running predictive models and parsing news…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {error && (
        <div style={{
          padding: 12, borderRadius: 8,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
          display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <AlertTriangle size={16} color="#ef4444" style={{ marginTop: 2 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#ef4444", margin: 0 }}>Analysis fetch failed</p>
            <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0" }}>{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Prediction card */}
          <div style={{
            display: "grid", gridTemplateColumns: "180px 1fr", gap: 16,
            padding: 16, borderRadius: 10, border: "1px solid var(--border)",
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, letterSpacing: 0.5 }}>NEXT DAY OUTLOOK</span>
              <div style={{
                padding: "10px 16px", borderRadius: 10,
                background: dirInfo.bg, border: `1px solid ${dirInfo.color}40`,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              }}>
                <dirInfo.Icon size={22} color={dirInfo.color} />
                <span style={{ fontSize: 14, fontWeight: 700, color: dirInfo.color }}>{dirInfo.label}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: "var(--muted)", fontWeight: 500 }}>Prediction Confidence</span>
                  <span style={{ color: dirInfo.color, fontWeight: 600 }}>{confidencePct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${confidencePct}%`, background: dirInfo.color,
                    transition: "width 0.8s ease",
                  }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>RATIONALE</div>
                <p style={{ fontSize: 12, color: "var(--fg)", margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>
                  &ldquo;{data.prediction?.rationale}&rdquo;
                </p>
              </div>
            </div>
          </div>

          {/* AI Insight */}
          {data.analysis?.summary && (
            <div style={{
              padding: 14, borderRadius: 10, border: "1px solid var(--border)",
              background: "rgba(99,102,241,0.04)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Sparkles size={12} color="#818cf8" />
                <span style={{ fontSize: 11, fontWeight: 600, color: "#818cf8" }}>Consolidated AI Insight</span>
              </div>
              <p style={{ fontSize: 13, color: "var(--fg)", margin: 0, lineHeight: 1.5 }}>
                {data.analysis.summary}
              </p>
            </div>
          )}

          {/* Drivers / Risks */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{
              padding: 12, borderRadius: 10, border: "1px solid var(--border)",
              background: "rgba(34,197,94,0.04)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
                <CheckCircle2 size={13} color="#22c55e" />
                <h3 style={{ fontSize: 12, fontWeight: 600, color: "#22c55e", margin: 0 }}>Bullish Drivers</h3>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {(data.analysis?.key_drivers || []).map((d: string, i: number) => (
                  <li key={i} style={{ fontSize: 11, color: "var(--fg)", display: "flex", gap: 6, lineHeight: 1.4 }}>
                    <span style={{ color: "#22c55e", flexShrink: 0 }}>•</span>
                    <span>{d}</span>
                  </li>
                ))}
                {(data.analysis?.key_drivers || []).length === 0 && (
                  <p style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", margin: 0 }}>No positive drivers identified.</p>
                )}
              </ul>
            </div>

            <div style={{
              padding: 12, borderRadius: 10, border: "1px solid var(--border)",
              background: "rgba(239,68,68,0.04)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
                <AlertTriangle size={13} color="#ef4444" />
                <h3 style={{ fontSize: 12, fontWeight: 600, color: "#ef4444", margin: 0 }}>Bearish Risks</h3>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {(data.analysis?.key_risks || []).map((r: string, i: number) => (
                  <li key={i} style={{ fontSize: 11, color: "var(--fg)", display: "flex", gap: 6, lineHeight: 1.4 }}>
                    <span style={{ color: "#ef4444", flexShrink: 0 }}>•</span>
                    <span>{r}</span>
                  </li>
                ))}
                {(data.analysis?.key_risks || []).length === 0 && (
                  <p style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", margin: 0 }}>No risks identified.</p>
                )}
              </ul>
            </div>
          </div>

          {/* Filtered news list */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", margin: 0 }}>
                News mentioning {ticker}
              </h3>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {(data.articles || []).length} {(data.articles || []).length === 1 ? "story" : "stories"}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {(data.articles || []).map((article: any, i: number) => {
                const src = SOURCE_COLORS[article.source] ?? DEFAULT_SOURCE;
                return (
                  <div
                    key={article.id ?? i}
                    style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}
                  >
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 13, fontWeight: 500, color: "var(--fg)",
                        textDecoration: "none", display: "block", marginBottom: 4, lineHeight: 1.4,
                      }}
                    >
                      {article.headline}
                    </a>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {article.source && (
                        <span style={{
                          fontSize: 10, fontWeight: 600,
                          padding: "1px 6px", borderRadius: 4,
                          background: src.bg, color: src.text,
                        }}>
                          {article.source}
                        </span>
                      )}
                      {article.published_at && (
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>
                          {timeAgo(article.published_at)}
                        </span>
                      )}
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ marginLeft: "auto", color: "var(--muted)", display: "flex" }}
                        title="Open article"
                      >
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                );
              })}
              {(data.articles || []).length === 0 && (
                <p style={{ fontSize: 12, color: "var(--muted)", padding: "20px 0", textAlign: "center", fontStyle: "italic" }}>
                  No recent news found mentioning {ticker}.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
