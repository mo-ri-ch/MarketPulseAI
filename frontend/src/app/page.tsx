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

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Dashboard() {
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

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

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      await fetch(`${API}/news/fetch`, { method: "POST" }).catch(() => {});
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`${API}/news/insights?limit=30`);
      if (res.ok) {
        setInsights(await res.json());
        setLastRefresh(new Date());
      }
    } catch {
      // falls back to mock data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
    const t = setInterval(fetchInsights, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchInsights]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--fg)", transition: "background-color 0.2s ease, color 0.2s ease" }}>
      <Header onRefresh={fetchInsights} loading={loading} lastRefresh={lastRefresh} theme={theme} toggleTheme={toggleTheme} />
      <MarketSummary />

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px", display: "grid", gridTemplateColumns: "200px 1fr 200px", gap: 40 }}>
        {/* Left: Watchlist */}
        <aside>
          <WatchlistPanel onSelectStock={setSelectedStock} />
        </aside>

        {/* Center: News + AI Summaries */}
        <section style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          <BreakingNews items={insights} loading={loading} />
          <AISummaryPanel items={insights} />
        </section>

        {/* Right: Sentiment + Alerts */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          <SentimentPanel items={insights} />
          <AlertsPanel />
        </aside>
      </main>

      {selectedStock && (
        <StockAnalysisModal ticker={selectedStock} onClose={() => setSelectedStock(null)} />
      )}
    </div>
  );
}
