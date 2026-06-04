"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/Header";
import MarketSummary from "@/components/MarketSummary";
import WatchlistPanel, { type PortfolioSummary } from "@/components/WatchlistPanel";
import BreakingNews from "@/components/BreakingNews";
import SentimentPanel from "@/components/SentimentPanel";
import StockAnalysisView from "@/components/StockAnalysisView";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Dashboard() {
  const [insights, setInsights] = useState<any[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [portfolios, setPortfolios] = useState<PortfolioSummary[]>([]);
  // null = "All News"; otherwise the portfolio id whose tickers drive the
  // news filter. Auto-defaults to the first portfolio once one arrives.
  const [feedPortfolioId, setFeedPortfolioId] = useState<number | null>(null);
  const userPickedFeedRef = useRef<boolean>(false);
  const prevIdsRef = useRef<Set<number>>(new Set());

  // Auto-select the first portfolio for the news filter the first time
  // portfolios arrive. Don't override after that — user picks win.
  useEffect(() => {
    if (userPickedFeedRef.current) return;
    if (portfolios.length > 0 && feedPortfolioId === null) {
      setFeedPortfolioId(portfolios[0].id);
    }
  }, [portfolios, feedPortfolioId]);

  const handleFeedPortfolioChange = useCallback((id: number | null) => {
    userPickedFeedRef.current = true;
    setFeedPortfolioId(id);
  }, []);

  const activePortfolio = portfolios.find((p) => p.id === feedPortfolioId) ?? null;
  const filterTickers = activePortfolio?.tickers ?? [];

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    } else {
      setTheme("light");
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    if (theme === "light") {
      setTheme("dark");
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      setTheme("light");
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  // Filter is active when a portfolio (not "all") is selected AND it has tickers.
  const useFilter = feedPortfolioId !== null && filterTickers.length > 0;
  // Memo-stable join so the poll callback's identity flips only on real change.
  const tickersKey = filterTickers.join(",");

  // Read-only poll: just fetches /news/insights — the backend scheduler handles crawling independently
  const pollInsights = useCallback(async () => {
    try {
      const url = useFilter
        ? `${API}/news/insights?limit=1000&tickers=${encodeURIComponent(tickersKey)}`
        : `${API}/news/insights?limit=1000`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setInsights(data);
        setLastRefresh(new Date());

        // Count articles that weren't in the previous snapshot
        const incoming = new Set<number>(data.map((i: any) => i.id));
        const fresh = data.filter((i: any) => !prevIdsRef.current.has(i.id));
        if (prevIdsRef.current.size > 0 && fresh.length > 0) {
          setNewCount(fresh.length);
        }
        prevIdsRef.current = incoming;
      }
    } catch {
      // Network error — keep showing last known data
    }
  }, [useFilter, tickersKey]);

  // Manual refresh: trigger a crawl immediately then read
  const manualRefresh = useCallback(async () => {
    setLoading(true);
    setNewCount(0);
    try {
      // Trigger crawl (fire-and-forget — backend may take a while)
      fetch(`${API}/news/fetch`, { method: "POST" }).catch(() => {});
      // Give crawlers 4 seconds to return some results, then read
      await new Promise((r) => setTimeout(r, 4000));
      await pollInsights();
    } finally {
      setLoading(false);
    }
  }, [pollInsights]);

  useEffect(() => {
    // Initial load
    pollInsights();
    // Auto-poll every 60 seconds — picks up whatever the backend scheduler has written
    const t = setInterval(pollInsights, 60 * 1000);
    return () => clearInterval(t);
  }, [pollInsights]);

  const dismissNewBanner = () => setNewCount(0);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--fg)", transition: "background-color 0.2s ease, color 0.2s ease" }}>
      <Header onRefresh={manualRefresh} loading={loading} lastRefresh={lastRefresh} theme={theme} toggleTheme={toggleTheme} />
      <MarketSummary />

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px", display: "grid", gridTemplateColumns: "200px 1fr 200px", gap: 40 }}>
        {/* Left: Watchlist */}
        <aside>
          <WatchlistPanel
            onSelectStock={setSelectedStock}
            onPortfoliosChange={setPortfolios}
          />
        </aside>

        {/* Center: Stock view OR live news feed */}
        <section style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          {selectedStock ? (
            <StockAnalysisView ticker={selectedStock} onBack={() => setSelectedStock(null)} />
          ) : (
            <BreakingNews
              items={insights}
              loading={loading}
              newCount={newCount}
              onDismissNew={dismissNewBanner}
              portfolios={portfolios}
              feedPortfolioId={feedPortfolioId}
              onFeedPortfolioChange={handleFeedPortfolioChange}
            />
          )}
        </section>

        {/* Right: Sentiment */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          <SentimentPanel items={insights} />
        </aside>
      </main>
    </div>
  );
}
