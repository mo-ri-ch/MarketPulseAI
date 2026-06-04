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
  "Hindu BusinessLine":{ bg: "rgba(20,184,166,0.12)",  text: "#2dd4bf" },
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
  feedMode?: "watchlist" | "all";
  onFeedModeChange?: (mode: "watchlist" | "all") => void;
  watchlistSize?: number;
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

export default function BreakingNews({
  items,
  loading,
  newCount,
  onDismissNew,
  feedMode = "all",
  onFeedModeChange,
  watchlistSize = 0,
}: Props) {
  const news = items;
  const isLive = items.length > 0;
  const watchlistAvailable = watchlistSize > 0;
  const showingWatchlist = feedMode === "watchlist" && watchlistAvailable;
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

  const now = Date.now();
  const todayItems: NewsItem[] = [];
  const yesterdayItems: NewsItem[] = [];

  news.forEach((item) => {
    const pubTime = item.published_at ? new Date(item.published_at).getTime() : now;
    const diffHrs = (now - pubTime) / (1000 * 60 * 60);
    if (diffHrs <= 24) {
      todayItems.push(item);
    } else {
      yesterdayItems.push(item);
    }
  });

  const renderGroup = (title: string, groupItems: NewsItem[], isToday: boolean) => {
    if (groupItems.length === 0) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          color: isToday ? "var(--green)" : "var(--muted)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          padding: "8px 0 6px 0",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          background: "var(--bg)",
          zIndex: 10,
          transition: "background-color 0.2s ease, border-color 0.2s ease"
        }}>
          <span>{title}</span>
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 10,
            background: isToday ? "rgba(34,197,94,0.1)" : "var(--border)",
            color: isToday ? "var(--green)" : "var(--muted)",
            transition: "background-color 0.2s ease, color 0.2s ease"
          }}>
            {groupItems.length} {groupItems.length === 1 ? 'story' : 'stories'}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {groupItems.map((item, i) => {
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
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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

          {/* Feed-mode segmented control */}
          {onFeedModeChange && (
            <div
              role="tablist"
              aria-label="News feed scope"
              style={{
                display: "flex",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: 2,
                fontSize: 11,
                fontWeight: 500,
                background: "var(--bg)",
              }}
            >
              <button
                role="tab"
                aria-selected={showingWatchlist}
                onClick={() => onFeedModeChange("watchlist")}
                disabled={!watchlistAvailable}
                title={watchlistAvailable ? "Show only news mentioning your watchlist stocks" : "Add stocks to your watchlist to enable this filter"}
                style={{
                  padding: "3px 9px",
                  borderRadius: 4,
                  border: "none",
                  cursor: watchlistAvailable ? "pointer" : "not-allowed",
                  opacity: watchlistAvailable ? 1 : 0.45,
                  background: showingWatchlist ? "var(--fg)" : "transparent",
                  color: showingWatchlist ? "var(--bg)" : "var(--muted)",
                  transition: "all 0.15s ease",
                }}
              >
                Watchlist{watchlistAvailable ? ` · ${watchlistSize}` : ""}
              </button>
              <button
                role="tab"
                aria-selected={!showingWatchlist}
                onClick={() => onFeedModeChange("all")}
                style={{
                  padding: "3px 9px",
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  background: !showingWatchlist ? "var(--fg)" : "transparent",
                  color: !showingWatchlist ? "var(--bg)" : "var(--muted)",
                  transition: "all 0.15s ease",
                }}
              >
                All News
              </button>
            </div>
          )}
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)", transition: "color 0.2s ease" }}>
          {loading ? "Fetching…" : `${news.length} ${news.length === 1 ? "story" : "stories"}`}
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

      {/* News list scrollable container */}
      <div 
        className="news-scroll-container"
        style={{ 
          display: "flex", 
          flexDirection: "column", 
          gap: 16,
          maxHeight: "550px",
          overflowY: "auto",
          paddingRight: "6px",
        }}
      >
        {renderGroup("Today / Last 24 Hours", todayItems, true)}
        {renderGroup("Yesterday / 24-48 Hours Ago", yesterdayItems, false)}

        {!loading && news.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--muted)", padding: "20px 0", textAlign: "center", lineHeight: 1.6 }}>
            {showingWatchlist ? (
              <>
                No recent news mentions your watchlist stocks.{" "}
                {onFeedModeChange && (
                  <button
                    onClick={() => onFeedModeChange("all")}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      color: "var(--fg)",
                      textDecoration: "underline",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    Show all news instead
                  </button>
                )}
              </>
            ) : (
              "No news yet — the backend is fetching updates every 10 minutes."
            )}
          </p>
        )}
      </div>

      {/* Keyframe animations & custom scrollbar */}
      <style>{`
        .news-scroll-container::-webkit-scrollbar {
          width: 6px;
        }
        .news-scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .news-scroll-container::-webkit-scrollbar-thumb {
          background-color: var(--border);
          border-radius: 3px;
        }
        .news-scroll-container::-webkit-scrollbar-thumb:hover {
          background-color: var(--muted);
        }
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
