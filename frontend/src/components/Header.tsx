"use client";

import { RefreshCw, Sun, Moon } from "lucide-react";
import Link from "next/link";

interface Props {
  onRefresh: () => void;
  loading: boolean;
  lastRefresh: Date | null;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

export default function Header({ onRefresh, loading, lastRefresh, theme, toggleTheme }: Props) {
  return (
    <header style={{ borderBottom: "1px solid var(--border)", padding: "0 24px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", transition: "border-color 0.2s ease" }}>
      <Link href="/" style={{ fontWeight: 600, fontSize: 15, color: "var(--fg)", textDecoration: "none", letterSpacing: "-0.01em", transition: "color 0.2s ease" }}>
        MarketPulse
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {lastRefresh && (
          <span style={{ color: "var(--muted)", fontSize: 12, transition: "color 0.2s ease" }}>
            Updated {lastRefresh.toLocaleTimeString()}
          </span>
        )}
        <button
          id="theme-btn"
          onClick={toggleTheme}
          title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4, display: "flex", alignItems: "center", transition: "color 0.2s ease" }}
        >
          {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
        </button>
        <button
          id="refresh-btn"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh"
          style={{ background: "none", border: "none", cursor: loading ? "not-allowed" : "pointer", color: "var(--muted)", padding: 4, display: "flex", alignItems: "center", opacity: loading ? 0.4 : 1, transition: "color 0.2s ease" }}
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
    </header>
  );
}
