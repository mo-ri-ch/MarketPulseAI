"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";

interface Props {
  onRefresh: () => void;
  loading: boolean;
  lastRefresh: Date | null;
  onSearch?: (query: string) => void;
}

export default function Header({ onRefresh, loading, lastRefresh }: Props) {
  return (
    <header style={{ borderBottom: "1px solid #e5e7eb", padding: "0 24px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Link href="/" style={{ fontWeight: 600, fontSize: 15, color: "#111", textDecoration: "none", letterSpacing: "-0.01em" }}>
        MarketPulse
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {lastRefresh && (
          <span style={{ color: "#9ca3af", fontSize: 12 }}>
            Updated {lastRefresh.toLocaleTimeString()}
          </span>
        )}
        <button
          id="refresh-btn"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh"
          style={{ background: "none", border: "none", cursor: loading ? "not-allowed" : "pointer", color: "#6b7280", padding: 4, display: "flex", alignItems: "center", opacity: loading ? 0.4 : 1 }}
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
    </header>
  );
}
