"use client";

import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const MOCK_SUMMARIES = [
  {
    id: 1,
    headline: "HDFC Bank Q4 Earnings Beat",
    source: "Moneycontrol",
    url: "https://www.moneycontrol.com/",
    summary: "HDFC Bank delivered exceptional Q4 FY26 results, reporting net profit 8% above consensus estimates driven by strong NII growth and controlled provisions. Analysts are likely to revise price targets upward following the outperformance.",
    tickers: ["HDFCBANK"],
    sentiment: { positive: 0.8, neutral: 0.15, negative: 0.05 },
    importance: 0.92,
    duplicate_count: 3,
    duplicate_sources: [
      { source: "Reuters",        url: "https://www.reuters.com/markets/" },
      { source: "Economic Times", url: "https://economictimes.indiatimes.com/markets" },
      { source: "CNBC TV18",      url: "https://www.cnbctv18.com/market/" },
    ],
  },
  {
    id: 2,
    headline: "Reliance AI Hardware Investment",
    source: "Economic Times",
    url: "https://economictimes.indiatimes.com/markets",
    summary: "Reliance Industries announced a ₹50,000 crore strategic investment into AI hardware infrastructure, signaling a major diversification into the technology sector. The move is expected to create significant long-term value while presenting near-term execution risks.",
    tickers: ["RELIANCE"],
    sentiment: { positive: 0.7, neutral: 0.2, negative: 0.1 },
    importance: 0.85,
    duplicate_count: 5,
    duplicate_sources: [
      { source: "Moneycontrol",      url: "https://www.moneycontrol.com/" },
      { source: "Business Standard", url: "https://www.business-standard.com/markets" },
      { source: "LiveMint",          url: "https://www.livemint.com/market" },
      { source: "CNBC TV18",         url: "https://www.cnbctv18.com/market/" },
      { source: "Reddit",            url: "https://www.reddit.com/r/IndianStockMarket/" },
    ],
  },
  {
    id: 3,
    headline: "TCS Secures $2.5B European Deal",
    source: "Reuters",
    url: "https://www.reuters.com/markets/",
    summary: "TCS won a landmark $2.5 billion multi-year outsourcing contract from a European banking consortium, reinforcing its position as a global IT leader. The deal is expected to meaningfully boost revenue visibility for FY27-28.",
    tickers: ["TCS"],
    sentiment: { positive: 0.85, neutral: 0.1, negative: 0.05 },
    importance: 0.88,
    duplicate_count: 4,
    duplicate_sources: [
      { source: "Moneycontrol",  url: "https://www.moneycontrol.com/" },
      { source: "Yahoo Finance", url: "https://finance.yahoo.com/" },
      { source: "TradingView",   url: "https://www.tradingview.com/news/" },
      { source: "CNBC TV18",     url: "https://www.cnbctv18.com/market/" },
    ],
  },
];

interface Props { items: any[] }

export default function AISummaryPanel({ items }: Props) {
  const [expanded, setExpanded] = useState<number | null>(0);
  const summaries = items.filter((i) => i.summary).length > 0 ? items : MOCK_SUMMARIES;

  return (
    <div className="rounded-2xl border border-card-border bg-card/50 backdrop-blur-sm">
      <div className="px-5 py-3 border-b border-card-border flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-sm">AI Summaries</h2>
        <span className="ml-auto text-xs text-muted bg-primary/10 text-primary px-2 py-0.5 rounded-full">
          Powered by Gemini
        </span>
      </div>

      <div className="divide-y divide-card-border/50">
        {summaries.slice(0, 5).map((item, i) => {
          const isOpen = expanded === i;
          const sent = item.sentiment;
          const posPercent = Math.round((sent?.positive ?? 0) * 100);

          return (
            <div key={item.id ?? i} className="px-5 py-3">
              <button
                className="w-full text-left"
                onClick={() => setExpanded(isOpen ? null : i)}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug line-clamp-1">
                    {item.headline}
                  </p>
                  <div className="shrink-0 mt-0.5">
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-muted" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted" />
                    )}
                  </div>
                </div>

                {/* Tickers + coverage */}
                <div className="flex items-center gap-2 mt-1">
                  {(item.tickers || []).map((t: string) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-accent border border-card-border font-mono text-primary">
                      {t}
                    </span>
                  ))}
                  {item.duplicate_count > 0 && (
                    <span className="text-[10px] text-muted">
                      {item.duplicate_count} sources
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <span className="text-[10px] text-green-400">{posPercent}% bullish</span>
                  </div>
                </div>
              </button>

              {/* Expandable summary */}
              {isOpen && (
                <div className="mt-3 space-y-3">
                  <div className="p-3 bg-accent/30 rounded-xl border border-card-border/50">
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      {item.summary}
                    </p>
                  </div>

                  {/* Contributing sources */}
                  {(item.duplicate_sources?.length > 0 || item.source) && (
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] text-muted mr-1">Also covered by:</span>
                      {/* Primary source — links to item.url */}
                      {item.source && (
                        <a
                          href={item.url ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Read on ${item.source}`}
                          className="text-[10px] px-1.5 py-0.5 rounded-md border bg-primary/10 text-primary border-primary/20 font-medium hover:opacity-70 transition-opacity"
                        >
                          {item.source}
                        </a>
                      )}
                      {/* Duplicate sources — each links to its own URL */}
                      {(item.duplicate_sources || []).map((d: any, di: number) => (
                        <a
                          key={di}
                          href={d.url ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Read on ${d.source ?? d}`}
                          className="text-[10px] px-1.5 py-0.5 rounded-md border bg-accent text-muted border-card-border font-medium hover:text-foreground hover:border-primary/30 transition-colors"
                        >
                          {d.source ?? d}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
