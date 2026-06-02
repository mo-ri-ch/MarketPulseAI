"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

const SAMPLE_WATCHLISTS = [
  { id: 1, name: "My Portfolio", stocks: ["RELIANCE", "TCS", "INFY", "HDFCBANK"] },
  { id: 2, name: "Tech",         stocks: ["WIPRO", "HCLTECH", "TECHM", "LTIM"]   },
];

const NIFTY_STOCKS = [
  "RELIANCE","TCS","HDFCBANK","INFY","HINDUNILVR","ICICIBANK","BAJFINANCE",
  "SBIN","BHARTIARTL","KOTAKBANK","WIPRO","AXISBANK","LT","HCLTECH",
  "ADANIENT","TATAMOTORS","TATASTEEL","MARUTI","SUNPHARMA","TITAN",
];

interface Props { onSelectStock?: (ticker: string) => void; }

export default function WatchlistPanel({ onSelectStock }: Props) {
  const [lists, setLists] = useState(SAMPLE_WATCHLISTS);
  const [activeId, setActiveId] = useState(1);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const active = lists.find((l) => l.id === activeId) || lists[0];
  const suggestions = NIFTY_STOCKS.filter((s) => s.includes(search.toUpperCase()) && !active?.stocks.includes(s));

  const addStock = (ticker: string) => {
    setLists((p) => p.map((l) => l.id === activeId ? { ...l, stocks: [...l.stocks, ticker] } : l));
    setSearch(""); setAdding(false);
  };

  const removeStock = (ticker: string) => {
    setLists((p) => p.map((l) => l.id === activeId ? { ...l, stocks: l.stocks.filter((s) => s !== ticker) } : l));
  };

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontWeight: 600, fontSize: 13, color: "#111" }}>Watchlist</h2>
        <div style={{ display: "flex", gap: 4 }}>
          {lists.map((l) => (
            <button
              key={l.id}
              onClick={() => setActiveId(l.id)}
              style={{ fontSize: 11, padding: "2px 8px", border: "1px solid", borderRadius: 4, cursor: "pointer", background: activeId === l.id ? "#111" : "none", color: activeId === l.id ? "#fff" : "#6b7280", borderColor: activeId === l.id ? "#111" : "#e5e7eb" }}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>

      {/* Stocks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {active?.stocks.map((ticker) => (
          <div
            key={ticker}
            onClick={() => onSelectStock?.(ticker)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
          >
            <span style={{ fontWeight: 500, fontSize: 13 }}>{ticker}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#16a34a" }}>+0.42%</span>
              <button
                onClick={(e) => { e.stopPropagation(); removeStock(ticker); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", padding: 0, display: "flex" }}
              >
                <X size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add */}
      <div style={{ marginTop: 10 }}>
        {adding ? (
          <div>
            <input
              autoFocus
              id="watchlist-search"
              type="text"
              placeholder="Search ticker…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 12, outline: "none" }}
            />
            {search.length > 0 && suggestions.length > 0 && (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 4, marginTop: 4, overflow: "hidden" }}>
                {suggestions.slice(0, 5).map((s) => (
                  <button
                    key={s}
                    onClick={() => addStock(s)}
                    style={{ width: "100%", textAlign: "left", padding: "6px 8px", fontSize: 12, background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setAdding(false)} style={{ fontSize: 11, color: "#9ca3af", marginTop: 6, background: "none", border: "none", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            id="add-stock-btn"
            onClick={() => setAdding(true)}
            style={{ fontSize: 12, color: "#6b7280", background: "none", border: "1px dashed #d1d5db", borderRadius: 4, padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
          >
            <Plus size={12} /> Add stock
          </button>
        )}
      </div>
    </div>
  );
}
