"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import MarketSummary from "@/components/MarketSummary";
import WatchlistPanel from "@/components/WatchlistPanel";
import BreakingNews from "@/components/BreakingNews";
import AISummaryPanel from "@/components/AISummaryPanel";
import SentimentPanel from "@/components/SentimentPanel";
import AlertsPanel from "@/components/AlertsPanel";
import StockAnalysisModal from "@/components/StockAnalysisModal";

export default function Dashboard() {
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      // Step 1: Trigger live crawl in the background
      await fetch("http://localhost:8000/news/fetch", { method: "POST" }).catch(() => {});

      // Step 2: Give crawlers ~3s head-start, then load whatever is in the DB
      await new Promise((r) => setTimeout(r, 3000));

      // Step 3: Load AI-enriched articles (includes real article URLs from crawlers)
      const res = await fetch("http://localhost:8000/news/insights?limit=30");
      if (res.ok) {
        const data = await res.json();
        setInsights(data);
        setLastRefresh(new Date());
      }
    } catch {
      // API not running yet – component falls back to built-in mock data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
    const interval = setInterval(fetchInsights, 5 * 60 * 1000); // auto-refresh every 5 min
    return () => clearInterval(interval);
  }, [fetchInsights]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header onRefresh={fetchInsights} loading={loading} lastRefresh={lastRefresh} />

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 py-6 space-y-6">
        {/* Row 1: Market Summary */}
        <MarketSummary />

        {/* Row 2: Main content grid */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Left column: Watchlist */}
          <div className="xl:col-span-1">
            <WatchlistPanel onSelectStock={setSelectedStock} />
          </div>

          {/* Center columns: News + AI */}
          <div className="xl:col-span-2 space-y-6">
            <BreakingNews items={insights} loading={loading} />
            <AISummaryPanel items={insights} />
          </div>

          {/* Right column: Sentiment + Alerts */}
          <div className="xl:col-span-1 space-y-6">
            <SentimentPanel items={insights} />
            <AlertsPanel />
          </div>
        </div>
      </main>

      {selectedStock && (
        <StockAnalysisModal ticker={selectedStock} onClose={() => setSelectedStock(null)} />
      )}
    </div>
  );
}
