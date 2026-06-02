"use client";

import { useState } from "react";
import { Plus, X, Star, ChevronDown } from "lucide-react";

const SAMPLE_WATCHLISTS = [
  { id: 1, name: "My Portfolio", stocks: ["RELIANCE", "TCS", "INFY", "HDFCBANK"] },
  { id: 2, name: "Tech Picks",   stocks: ["WIPRO", "HCLTECH", "TECHM", "LTIM"]   },
];

const NIFTY_STOCKS = [
  "RELIANCE","TCS","HDFCBANK","INFY","HINDUNILVR","ICICIBANK","BAJFINANCE",
  "SBIN","BHARTIARTL","KOTAKBANK","WIPRO","AXISBANK","LT","HCLTECH",
  "ADANIENT","TATAMOTORS","TATASTEEL","MARUTI","SUNPHARMA","TITAN",
];

interface Props {
  onSelectStock?: (ticker: string) => void;
}

export default function WatchlistPanel({ onSelectStock }: Props) {
  const [lists, setLists] = useState(SAMPLE_WATCHLISTS);
  const [activeId, setActiveId] = useState(1);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const active = lists.find((l) => l.id === activeId) || lists[0];

  const filteredSearch = NIFTY_STOCKS.filter(
    (s) => s.includes(search.toUpperCase()) && !active?.stocks.includes(s)
  );

  const addStock = (ticker: string) => {
    setLists((prev) =>
      prev.map((l) =>
        l.id === activeId ? { ...l, stocks: [...l.stocks, ticker] } : l
      )
    );
    setSearch("");
    setAdding(false);
  };

  const removeStock = (ticker: string) => {
    setLists((prev) =>
      prev.map((l) =>
        l.id === activeId ? { ...l, stocks: l.stocks.filter((s) => s !== ticker) } : l
      )
    );
  };

  return (
    <div className="rounded-2xl border border-card-border bg-card/50 backdrop-blur-sm h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Watchlist</h2>
        </div>
        {/* Tab switcher */}
        <div className="flex gap-1">
          {lists.map((l) => (
            <button
              key={l.id}
              onClick={() => setActiveId(l.id)}
              className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                activeId === l.id
                  ? "bg-primary/20 text-primary"
                  : "text-muted hover:text-foreground hover:bg-accent/40"
              }`}
            >
              {l.name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Stock list */}
      <div className="flex-1 overflow-y-auto divide-y divide-card-border/50">
        {active?.stocks.map((ticker) => (
          <div
            key={ticker}
            onClick={() => onSelectStock?.(ticker)}
            className="px-4 py-2.5 flex items-center justify-between group hover:bg-accent/30 transition-all cursor-pointer select-none active:scale-[0.99]"
          >
            <div>
              <p className="text-sm font-semibold group-hover:text-primary transition-colors">{ticker}</p>
              <p className="text-xs text-muted">NSE</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-400 font-medium">+0.42%</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeStock(ticker);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-red-400 p-1 rounded hover:bg-accent"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add stock */}
      <div className="p-3 border-t border-card-border">
        {adding ? (
          <div className="space-y-2">
            <input
              autoFocus
              id="watchlist-search"
              type="text"
              placeholder="Search ticker (e.g. TCS)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 bg-accent/50 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {search.length > 0 && filteredSearch.length > 0 && (
              <div className="bg-card border border-card-border rounded-lg overflow-hidden max-h-36 overflow-y-auto">
                {filteredSearch.slice(0, 6).map((s) => (
                  <button
                    key={s}
                    onClick={() => addStock(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent/40 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setAdding(false)}
              className="text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            id="add-stock-btn"
            onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-muted hover:text-foreground border border-dashed border-card-border rounded-lg hover:border-primary/40 hover:bg-primary/5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Stock
          </button>
        )}
      </div>
    </div>
  );
}
