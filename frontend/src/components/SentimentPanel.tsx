"use client";

import { Activity } from "lucide-react";

interface Props { items: any[] }

const MOCK = {
  positive: 0.62,
  neutral: 0.24,
  negative: 0.14,
  total: 47,
};

export default function SentimentPanel({ items }: Props) {
  // Aggregate sentiment from live data
  const agg = items.length > 0
    ? items.reduce(
        (acc, item) => {
          const s = item.sentiment;
          if (!s) return acc;
          return {
            positive: acc.positive + s.positive,
            neutral: acc.neutral + s.neutral,
            negative: acc.negative + s.negative,
            total: acc.total + 1,
          };
        },
        { positive: 0, neutral: 0, negative: 0, total: 0 }
      )
    : MOCK;

  const divisor = items.length > 0 ? (agg.total || 1) : 1;
  const pos  = Math.round((agg.positive / divisor) * 100);
  const neu  = Math.round((agg.neutral  / divisor) * 100);
  const neg  = Math.round((agg.negative / divisor) * 100);

  const label =
    pos > 55 ? "Bullish" : neg > 40 ? "Bearish" : "Mixed";
  const labelColor =
    pos > 55 ? "text-green-400" : neg > 40 ? "text-red-400" : "text-yellow-400";

  return (
    <div className="rounded-2xl border border-card-border bg-card/50 backdrop-blur-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-sm">Market Sentiment</h2>
      </div>

      {/* Overall label */}
      <div className="text-center py-2">
        <p className={`text-3xl font-black ${labelColor}`}>{label}</p>
        <p className="text-xs text-muted mt-1">Based on {agg.total} articles</p>
      </div>

      {/* Stacked bar */}
      <div className="h-3 rounded-full overflow-hidden flex gap-0.5">
        <div
          className="bg-green-500 rounded-l-full transition-all duration-700"
          style={{ width: `${pos}%` }}
        />
        <div
          className="bg-yellow-500 transition-all duration-700"
          style={{ width: `${neu}%` }}
        />
        <div
          className="bg-red-500 rounded-r-full transition-all duration-700"
          style={{ width: `${neg}%` }}
        />
      </div>

      {/* Legend */}
      <div className="space-y-2">
        {[
          { label: "Positive", pct: pos, color: "bg-green-500", text: "text-green-400" },
          { label: "Neutral",  pct: neu, color: "bg-yellow-500", text: "text-yellow-400" },
          { label: "Negative", pct: neg, color: "bg-red-500", text: "text-red-400" },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-sm">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${row.color}`} />
            <span className="text-muted flex-1">{row.label}</span>
            <span className={`font-semibold ${row.text}`}>{row.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
