"use client";

import { ExternalLink, Zap } from "lucide-react";

// Per-source color palette for badges
const SOURCE_COLORS: Record<string, string> = {
  "NSE India":         "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "Moneycontrol":      "bg-orange-500/15 text-orange-400 border-orange-500/20",
  "Reuters":           "bg-red-500/15 text-red-400 border-red-500/20",
  "TradingView":       "bg-sky-500/15 text-sky-400 border-sky-500/20",
  "Motilal Oswal":     "bg-purple-500/15 text-purple-400 border-purple-500/20",
  "Yahoo Finance":     "bg-violet-500/15 text-violet-400 border-violet-500/20",
  "Economic Times":    "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  "LiveMint":          "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  "Business Standard": "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  "CNBC TV18":         "bg-rose-500/15 text-rose-400 border-rose-500/20",
  "Reddit":            "bg-orange-600/15 text-orange-500 border-orange-600/20",
  "FrontPage":         "bg-teal-500/15 text-teal-400 border-teal-500/20",
};

const MOCK_NEWS = [
  { id: 1, headline: "HDFC Bank reports record Q4 profit, beats analyst estimates by 8%",            url: "https://www.moneycontrol.com/news/business/markets/",                        source: "Moneycontrol",      published_at: "2026-05-24T09:15:00", sentiment: { positive: 0.8,  neutral: 0.15, negative: 0.05 } },
  { id: 2, headline: "Reliance Industries enters AI hardware space with ₹50,000 crore investment",  url: "https://economictimes.indiatimes.com/markets/stocks/news/",                 source: "Economic Times",    published_at: "2026-05-24T08:40:00", sentiment: { positive: 0.7,  neutral: 0.2,  negative: 0.1  } },
  { id: 3, headline: "SEBI tightens F&O regulations; derivatives volumes expected to drop 30%",     url: "https://www.nseindia.com/",                                                source: "NSE India",         published_at: "2026-05-24T08:00:00", sentiment: { positive: 0.1,  neutral: 0.3,  negative: 0.6  } },
  { id: 4, headline: "TCS bags $2.5 billion multi-year deal with European banking consortium",       url: "https://www.reuters.com/markets/",                                         source: "Reuters",           published_at: "2026-05-24T07:30:00", sentiment: { positive: 0.85, neutral: 0.1,  negative: 0.05 } },
  { id: 5, headline: "Infosys lowers FY27 revenue guidance on macro headwinds, stock slumps 4%",   url: "https://www.livemint.com/market/",                                         source: "LiveMint",          published_at: "2026-05-24T07:00:00", sentiment: { positive: 0.05, neutral: 0.2,  negative: 0.75 } },
  { id: 6, headline: "Bajaj Finance Q4 NII grows 26% YoY; asset quality remains stable",           url: "https://www.business-standard.com/markets/",                              source: "Business Standard", published_at: "2026-05-24T06:45:00", sentiment: { positive: 0.75, neutral: 0.2,  negative: 0.05 } },
  { id: 7, headline: "Adani Ports wins ₹2,100 crore Colombo terminal expansion contract",          url: "https://www.cnbctv18.com/market/",                                         source: "CNBC TV18",         published_at: "2026-05-24T06:20:00", sentiment: { positive: 0.7,  neutral: 0.25, negative: 0.05 } },
  { id: 8, headline: "r/IndianStockMarket: Should I exit midcaps ahead of Fed decision?",          url: "https://www.reddit.com/r/IndianStockMarket/",                              source: "Reddit",            published_at: "2026-05-24T05:55:00", sentiment: { positive: 0.1,  neutral: 0.6,  negative: 0.3  } },
];

interface Props {
  items: any[];
  loading: boolean;
}

function SourceBadge({ source, url }: { source: string; url: string }) {
  const cls = SOURCE_COLORS[source] ?? "bg-accent text-muted border-card-border";
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Read on ${source}`}
      className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium shrink-0 transition-opacity hover:opacity-70 ${cls}`}
    >
      {source}
    </a>
  );
}

function SentimentBadge({ s }: { s: any }) {
  if (!s) return null;
  if (s.positive > 0.5) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 font-medium">Bullish</span>;
  if (s.negative > 0.5) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">Bearish</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 font-medium">Neutral</span>;
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000 / 60;
  if (diff < 1)    return "just now";
  if (diff < 60)   return `${Math.round(diff)}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return `${Math.round(diff / 1440)}d ago`;
}

export default function BreakingNews({ items, loading }: Props) {
  const news = items.length > 0 ? items : MOCK_NEWS;

  return (
    <div className="rounded-2xl border border-card-border bg-card/50 backdrop-blur-sm">
      {/* Header */}
      <div className="px-5 py-3 border-b border-card-border flex items-center gap-2">
        <Zap className="w-4 h-4 text-yellow-400" />
        <h2 className="font-semibold text-sm">Breaking News</h2>
        {loading ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Fetching…
          </span>
        ) : (
          <span className="ml-auto text-xs text-muted">{news.length} stories</span>
        )}
      </div>

      {/* News list */}
      <div className="divide-y divide-card-border/50">
        {news.slice(0, 8).map((item, i) => (
          <article
            key={item.id ?? i}
            className="px-5 py-3.5 hover:bg-accent/20 transition-colors group"
          >
            <div className="flex items-start gap-3">
              {/* Rank number */}
              <span className="text-lg font-black text-primary/25 select-none w-5 shrink-0 mt-0.5 leading-none">
                {(i + 1).toString().padStart(2, "0")}
              </span>

              <div className="flex-1 min-w-0 space-y-1.5">
                {/* Headline */}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium leading-snug hover:text-primary transition-colors line-clamp-2 block"
                >
                  {item.headline}
                </a>

                {/* Meta row: source + sentiment + time + external link */}
                <div className="flex items-center gap-2 flex-wrap">
                  <SourceBadge source={item.source ?? item.source_name ?? "Unknown"} url={item.url ?? "#"} />
                  <SentimentBadge s={item.sentiment} />
                  {item.published_at && (
                    <span className="text-xs text-muted">{timeAgo(item.published_at)}</span>
                  )}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-primary"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
