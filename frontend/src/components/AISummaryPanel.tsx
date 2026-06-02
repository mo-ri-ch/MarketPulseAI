"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const MOCK_SUMMARIES = [
  {
    id: 1,
    headline: "HDFC Bank Q4 Earnings Beat",
    tickers: ["HDFCBANK"],
    summary: "HDFC Bank delivered exceptional Q4 FY26 results, reporting net profit 8% above consensus estimates driven by strong NII growth and controlled provisions. Analysts are likely to revise price targets upward following the outperformance.",
    sentiment: { positive: 0.8 },
    duplicate_count: 3,
  },
  {
    id: 2,
    headline: "Reliance AI Hardware Investment",
    tickers: ["RELIANCE"],
    summary: "Reliance Industries announced a ₹50,000 crore strategic investment into AI hardware infrastructure, signaling a major diversification into the technology sector.",
    sentiment: { positive: 0.7 },
    duplicate_count: 5,
  },
  {
    id: 3,
    headline: "TCS Secures $2.5B European Deal",
    tickers: ["TCS"],
    summary: "TCS won a landmark $2.5 billion multi-year outsourcing contract from a European banking consortium, reinforcing its position as a global IT leader.",
    sentiment: { positive: 0.85 },
    duplicate_count: 4,
  },
];

interface Props { items: any[] }

export default function AISummaryPanel({ items }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const summaries = items.filter((i) => i.summary).length > 0 ? items : MOCK_SUMMARIES;

  return (
    <div>
      <h2 style={{ fontWeight: 600, fontSize: 13, color: "#111", marginBottom: 12 }}>AI Summaries</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {summaries.slice(0, 5).map((item, i) => {
          const isOpen = expanded === i;
          return (
            <div key={item.id ?? i} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <button
                onClick={() => setExpanded(isOpen ? null : i)}
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13, color: "#111", marginBottom: 2 }}>{item.headline}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>
                    {(item.tickers || []).join(", ")}
                    {item.duplicate_count > 0 && ` · ${item.duplicate_count} sources`}
                  </div>
                </div>
                <span style={{ color: "#9ca3af", flexShrink: 0 }}>
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {isOpen && (
                <div style={{ paddingBottom: 10, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
                  {item.summary}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
