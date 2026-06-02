"use client";

import { ExternalLink } from "lucide-react";

function getRecentTimestamp(hoursAgo: number) {
  const d = new Date();
  d.setTime(d.getTime() - hoursAgo * 60 * 60 * 1000);
  return d.toISOString();
}

const MOCK_NEWS = [
  { id: 1, headline: "HDFC Bank reports record Q4 profit, beats analyst estimates by 8%",           url: "https://www.moneycontrol.com/news/business/markets/",           source: "Moneycontrol",      published_at: getRecentTimestamp(0.5), sentiment: { positive: 0.8,  negative: 0.05 } },
  { id: 2, headline: "Reliance Industries enters AI hardware space with ₹50,000 crore investment", url: "https://economictimes.indiatimes.com/markets/stocks/news/",      source: "Economic Times",   published_at: getRecentTimestamp(1.5), sentiment: { positive: 0.7,  negative: 0.1  } },
  { id: 3, headline: "SEBI tightens F&O regulations; derivatives volumes expected to drop 30%",    url: "https://www.nseindia.com/",                                    source: "NSE India",         published_at: getRecentTimestamp(4),   sentiment: { positive: 0.1,  negative: 0.6  } },
  { id: 4, headline: "TCS bags $2.5 billion multi-year deal with European banking consortium",      url: "https://www.reuters.com/markets/",                             source: "Reuters",           published_at: getRecentTimestamp(8),   sentiment: { positive: 0.85, negative: 0.05 } },
  { id: 5, headline: "Infosys lowers FY27 revenue guidance on macro headwinds, stock slumps 4%",  url: "https://www.livemint.com/market/",                             source: "LiveMint",          published_at: getRecentTimestamp(14),  sentiment: { positive: 0.05, negative: 0.75 } },
  { id: 6, headline: "Bajaj Finance Q4 NII grows 26% YoY; asset quality remains stable",          url: "https://www.business-standard.com/markets/",                  source: "Business Standard", published_at: getRecentTimestamp(22),  sentiment: { positive: 0.75, negative: 0.05 } },
  { id: 7, headline: "Adani Ports wins ₹2,100 crore Colombo terminal expansion contract",         url: "https://www.cnbctv18.com/market/",                             source: "CNBC TV18",         published_at: getRecentTimestamp(29),  sentiment: { positive: 0.7,  negative: 0.05 } },
  { id: 8, headline: "r/IndianStockMarket: Should I exit midcaps ahead of Fed decision?",         url: "https://www.reddit.com/r/IndianStockMarket/",                  source: "Reddit",            published_at: getRecentTimestamp(38),  sentiment: { positive: 0.1,  negative: 0.3  } },
];

interface Props { items: any[]; loading: boolean; }

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000 / 60;
  if (diff < 60)   return `${Math.round(diff)}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return `${Math.round(diff / 1440)}d ago`;
}

function sentimentLabel(s: any) {
  if (!s) return null;
  if (s.positive > 0.5) return { label: "Bullish", color: "var(--green)" };
  if (s.negative > 0.5) return { label: "Bearish", color: "var(--red)" };
  return { label: "Neutral", color: "var(--yellow)" };
}

export default function BreakingNews({ items, loading }: Props) {
  const isDemo = items.length === 0;
  const news = !isDemo ? items : MOCK_NEWS;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)", transition: "color 0.2s ease" }}>
          News {isDemo && <span style={{ color: "var(--yellow)", fontSize: 11, fontWeight: 400, marginLeft: 6 }}>(Demo Data)</span>}
        </h2>
        <span style={{ fontSize: 12, color: "var(--muted)", transition: "color 0.2s ease" }}>
          {loading ? "Fetching…" : `${news.length} stories`}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {news.slice(0, 8).map((item, i) => {
          const sent = sentimentLabel(item.sentiment);
          return (
            <div key={item.id ?? i} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", transition: "border-color 0.2s ease" }}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontWeight: 500, fontSize: 13, color: "var(--fg)", textDecoration: "none", display: "block", marginBottom: 4, lineHeight: 1.4, transition: "color 0.2s ease" }}
              >
                {item.headline}
              </a>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "var(--muted)", transition: "color 0.2s ease" }}>
                <span>{item.source}</span>
                {item.published_at && <span>{timeAgo(item.published_at)}</span>}
                {sent && <span style={{ color: sent.color, transition: "color 0.2s ease" }}>{sent.label}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
