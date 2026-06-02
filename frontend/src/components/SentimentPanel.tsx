"use client";

interface Props { items: any[] }

const MOCK = { positive: 0.62, neutral: 0.24, negative: 0.14, total: 47 };

export default function SentimentPanel({ items }: Props) {
  const agg = items.length > 0
    ? items.reduce((acc, item) => {
        const s = item.sentiment;
        if (!s) return acc;
        return { positive: acc.positive + s.positive, neutral: acc.neutral + s.neutral, negative: acc.negative + s.negative, total: acc.total + 1 };
      }, { positive: 0, neutral: 0, negative: 0, total: 0 })
    : MOCK;

  const d = items.length > 0 ? (agg.total || 1) : 1;
  const pos = Math.round((agg.positive / d) * 100);
  const neu = Math.round((agg.neutral  / d) * 100);
  const neg = Math.round((agg.negative / d) * 100);
  const label = pos > 55 ? "Bullish" : neg > 40 ? "Bearish" : "Mixed";
  const labelColor = pos > 55 ? "#16a34a" : neg > 40 ? "#dc2626" : "#ca8a04";

  return (
    <div>
      <h2 style={{ fontWeight: 600, fontSize: 13, color: "#111", marginBottom: 12 }}>Sentiment</h2>

      <div style={{ marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 18, color: labelColor }}>{label}</span>
        <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>{agg.total} articles</span>
      </div>

      {/* Bar */}
      <div style={{ height: 6, borderRadius: 3, overflow: "hidden", display: "flex", marginBottom: 10, background: "#f3f4f6" }}>
        <div style={{ width: `${pos}%`, background: "#16a34a" }} />
        <div style={{ width: `${neu}%`, background: "#ca8a04" }} />
        <div style={{ width: `${neg}%`, background: "#dc2626" }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {[
          { label: "Bullish", pct: pos, color: "#16a34a" },
          { label: "Neutral", pct: neu, color: "#ca8a04" },
          { label: "Bearish", pct: neg, color: "#dc2626" },
        ].map((r) => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "#6b7280" }}>{r.label}</span>
            <span style={{ color: r.color, fontWeight: 500 }}>{r.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
