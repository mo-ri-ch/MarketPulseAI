"use client";

import { RefreshCw, TrendingUp, Bell, Search, Menu } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

interface Props {
  onRefresh: () => void;
  loading: boolean;
  lastRefresh: Date | null;
  onSearch?: (query: string) => void;
}

export default function Header({ onRefresh, loading, lastRefresh, onSearch }: Props) {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch && query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-card-border bg-background/80 backdrop-blur-xl">
      <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0" onClick={() => { if(onSearch) onSearch(""); }}>
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight hidden sm:block">
            Market<span className="text-primary">Pulse</span>
          </span>
        </Link>

        {/* Search */}
        <form onSubmit={handleSubmit} className="flex-1 max-w-xl relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            id="dashboard-search"
            type="text"
            placeholder="Search stocks, news, tickers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-accent/60 border border-card-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all placeholder:text-muted"
          />
        </form>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-auto">
          {lastRefresh && (
            <span className="text-xs text-muted hidden md:block">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            id="refresh-btn"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh news"
            className="p-2 rounded-xl hover:bg-accent/60 transition-colors text-muted hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            id="alerts-btn"
            className="p-2 rounded-xl hover:bg-accent/60 transition-colors text-muted hover:text-foreground relative"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full"></span>
          </button>
        </div>
      </div>
    </header>
  );
}
