"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/Header";
import MarketSummary from "@/components/MarketSummary";
import WatchlistPanel from "@/components/WatchlistPanel";
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
  const prevIdsRef = useRef<Set<number>>(new Set());

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

  // Read-only poll: just fetches /news/insights — the backend scheduler handles crawling independently
  const pollInsights = useCallback(async () => {
    try {
      const res = await fetch(`${API}/news/insights?limit=50`);
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
  }, []);

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
          <WatchlistPanel onSelectStock={setSelectedStock} />
        </aside>

        {/* Center: Stock view OR live news feed */}
        <section style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          {selectedStock ? (
            <StockAnalysisView ticker={selectedStock} onBack={() => setSelectedStock(null)} />
          ) : (
            <BreakingNews items={insights} loading={loading} newCount={newCount} onDismissNew={dismissNewBanner} />
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
