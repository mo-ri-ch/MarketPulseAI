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
  const labelColor = pos > 55 ? "var(--green)" : neg > 40 ? "var(--red)" : "var(--yellow)";

  return (
    <div>
      <h2 style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)", marginBottom: 12, transition: "color 0.2s ease" }}>Sentiment</h2>

      <div style={{ marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 18, color: labelColor, transition: "color 0.2s ease" }}>{label}</span>
        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8, transition: "color 0.2s ease" }}>{agg.total} articles</span>
      </div>

      {/* Bar */}
      <div style={{ height: 6, borderRadius: 3, overflow: "hidden", display: "flex", marginBottom: 10, background: "var(--border)", transition: "background-color 0.2s ease" }}>
        <div style={{ width: `${pos}%`, background: "var(--green)" }} />
        <div style={{ width: `${neu}%`, background: "var(--yellow)" }} />
        <div style={{ width: `${neg}%`, background: "var(--red)" }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {[
          { label: "Bullish", pct: pos, color: "var(--green)" },
          { label: "Neutral", pct: neu, color: "var(--yellow)" },
          { label: "Bearish", pct: neg, color: "var(--red)" },
        ].map((r) => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--muted)", transition: "color 0.2s ease" }}>{r.label}</span>
            <span style={{ color: r.color, fontWeight: 500, transition: "color 0.2s ease" }}>{r.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
