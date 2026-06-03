"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Per-source color palette for badges
const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  "NSE India":         { bg: "rgba(59,130,246,0.12)",  text: "#60a5fa" },
  "Moneycontrol":      { bg: "rgba(249,115,22,0.12)",  text: "#fb923c" },
  "Reuters":           { bg: "rgba(239,68,68,0.12)",   text: "#f87171" },
  "TradingView":       { bg: "rgba(14,165,233,0.12)",  text: "#38bdf8" },
  "Motilal Oswal":     { bg: "rgba(168,85,247,0.12)",  text: "#c084fc" },
  "Yahoo Finance":     { bg: "rgba(139,92,246,0.12)",  text: "#a78bfa" },
  "Economic Times":    { bg: "rgba(234,179,8,0.12)",   text: "#facc15" },
  "LiveMint":          { bg: "rgba(16,185,129,0.12)",  text: "#34d399" },
  "Business Standard": { bg: "rgba(6,182,212,0.12)",   text: "#22d3ee" },
  "CNBC TV18":         { bg: "rgba(244,63,94,0.12)",   text: "#fb7185" },
  "Reddit":            { bg: "rgba(234,88,12,0.12)",   text: "#f97316" },
  "FrontPage":         { bg: "rgba(20,184,166,0.12)",  text: "#2dd4bf" },
  "Google News":       { bg: "rgba(99,102,241,0.12)",  text: "#818cf8" },
};

const DEFAULT_SOURCE = { bg: "rgba(100,116,139,0.12)", text: "#94a3b8" };

interface NewsItem {
  id: number;
  headline: string;
  url: string;
  source?: string;
  published_at?: string;
  sentiment?: { positive: number; negative: number };
}

interface Props {
  items: NewsItem[];
  loading: boolean;
  newCount: number;
  onDismissNew: () => void;
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function sentimentLabel(s: any) {
  if (!s) return null;
  if (s.positive > 0.5) return { label: "Bullish", color: "#22c55e" };
  if (s.negative > 0.5) return { label: "Bearish", color: "#ef4444" };
  return { label: "Neutral", color: "#eab308" };
}

export default function BreakingNews({ items, loading, newCount, onDismissNew }: Props) {
  const news = items.slice(0, 30);
  const isLive = items.length > 0;
  const prevTopIdRef = useRef<number | null>(null);
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());

  // When items list changes, track which IDs are newly on top
  useEffect(() => {
    if (items.length === 0) return;
    const topId = items[0]?.id;
    if (prevTopIdRef.current !== null && topId !== prevTopIdRef.current) {
      // Find all IDs that are newer than the previous top
      const prev = prevTopIdRef.current;
      const newOnes = new Set(
        items.filter(i => i.id > prev).map(i => i.id)
      );
      setFreshIds(newOnes);
      // Remove the highlight after 3 seconds
      setTimeout(() => setFreshIds(new Set()), 3000);
    }
    prevTopIdRef.current = topId;
  }, [items]);

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)", transition: "color 0.2s ease", margin: 0 }}>
            News
          </h2>
          {/* Live indicator */}
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: isLive ? "#22c55e" : "var(--muted)", transition: "color 0.2s ease" }}>
            <span style={{
              display: "inline-block",
              width: 6, height: 6,
              borderRadius: "50%",
              background: isLive ? "#22c55e" : "var(--muted)",
              boxShadow: isLive ? "0 0 0 0 rgba(34,197,94,0.6)" : "none",
              animation: isLive ? "livePulse 2s ease-in-out infinite" : "none",
            }} />
            LIVE
          </span>
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)", transition: "color 0.2s ease" }}>
          {loading ? "Fetching…" : `${news.length} stories`}
        </span>
      </div>

      {/* "N new stories" banner */}
      {newCount > 0 && (
        <div
          onClick={onDismissNew}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "7px 12px", marginBottom: 8,
            background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.25)",
            borderRadius: 8, cursor: "pointer",
            animation: "slideDown 0.3s ease-out",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: "#22c55e" }}>
            ↑ {newCount} new {newCount === 1 ? "story" : "stories"}
          </span>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Dismiss</span>
        </div>
      )}

      {/* News list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {news.map((item, i) => {
          const sent = sentimentLabel(item.sentiment);
          const srcColor = SOURCE_COLORS[item.source ?? ""] ?? DEFAULT_SOURCE;
          const isFresh = freshIds.has(item.id);
          return (
            <div
              key={item.id ?? i}
              style={{
                padding: "10px 0",
                borderBottom: "1px solid var(--border)",
                transition: "border-color 0.2s ease, background-color 0.5s ease",
                borderRadius: isFresh ? 4 : 0,
                background: isFresh ? "rgba(34,197,94,0.06)" : "transparent",
                animation: isFresh ? "fadeInRow 0.4s ease-out" : "none",
              }}
            >
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontWeight: 500, fontSize: 13, color: "var(--fg)",
                  textDecoration: "none", display: "block",
                  marginBottom: 4, lineHeight: 1.4,
                  transition: "color 0.2s ease",
                }}
              >
                {item.headline}
              </a>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {item.source && (
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    padding: "1px 6px", borderRadius: 4,
                    background: srcColor.bg, color: srcColor.text,
                  }}>
                    {item.source}
                  </span>
                )}
                {item.published_at && (
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    {timeAgo(item.published_at)}
                  </span>
                )}
                {sent && (
                  <span style={{ fontSize: 11, color: sent.color, fontWeight: 500 }}>
                    {sent.label}
                  </span>
                )}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginLeft: "auto", color: "var(--muted)", display: "flex", alignItems: "center" }}
                  title="Open article"
                >
                  <ExternalLink size={11} />
                </a>
              </div>
            </div>
          );
        })}

        {!loading && news.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--muted)", padding: "20px 0", textAlign: "center" }}>
            No news yet — the backend is fetching updates every 10 minutes.
          </p>
        )}
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes livePulse {
          0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.6); }
          70%  { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInRow {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
