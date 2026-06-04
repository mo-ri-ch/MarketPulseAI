"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { apiJson, isLoggedIn, AuthError } from "@/lib/api";

// Searchable ticker universe — NIFTY 50 + popular non-NIFTY-50 retail names
// (IRCTC, SUZLON, IRFC, HAL, BEL, etc.) so substring search resolves them.
// Kept in sync with backend NIFTY50_TICKERS in crawlers/sources.py so any
// ticker added here will also get proper news-alias matching server-side.
const NIFTY_STOCKS = [
  // NIFTY 50 core
  "RELIANCE","TCS","HDFCBANK","INFY","HINDUNILVR","ICICIBANK","BAJFINANCE",
  "SBIN","BHARTIARTL","KOTAKBANK","WIPRO","AXISBANK","LT","HCLTECH",
  "ADANIENT","ADANIPORTS","TATAMOTORS","TATASTEEL","MARUTI","SUNPHARMA",
  "TITAN","NESTLEIND","ULTRACEMCO","ASIANPAINT","ONGC","POWERGRID","NTPC",
  "COALINDIA","JSWSTEEL","INDUSINDBK","M&M","HEROMOTOCO","BAJAJ-AUTO",
  "EICHERMOT","GRASIM","DRREDDY","CIPLA","APOLLOHOSP","DIVISLAB","BPCL",
  "BRITANNIA","TATACONSUM","HDFCLIFE","SBILIFE","BAJAJFINSV","SHRIRAMFIN",
  "TRENT","JIOFIN","ETERNAL","HINDALCO","IOC",
  // Popular non-NIFTY-50 retail favourites
  "IRCTC","SUZLON","IRFC","RVNL","IRCON","HAL","BEL","BHEL","MAZDOCK",
  "COCHINSHIP","GAIL","VEDL","TATAPOWER","ADANIPOWER","ADANIGREEN",
  "JINDALSTEL","SAIL","NMDC","NATIONALUM","JSWENERGY","YESBANK",
  "IDFCFIRSTB","PNB","BANKBARODA","CANBK","UNIONBANK","BANDHANBNK",
  "AUBANK","RBLBANK","FEDERALBNK","IDEA","INDUSTOWER","LTIM","MPHASIS",
  "COFORGE","PERSISTENT","OFSS","TATAELXSI","POLICYBZR","PAYTM","NYKAA",
  "DELHIVERY","NAUKRI","INDIAMART","JUSTDIAL","MUTHOOTFIN","CHOLAFIN",
  "MANAPPURAM","SBICARD","LUPIN","AUROPHARMA","BIOCON","TORNTPHARM",
  "ZYDUSLIFE","MANKIND","ITC","DABUR","MARICO","GODREJCP","COLPAL","VBL",
  "VOLTAS","HAVELLS","SIEMENS","ABB","CUMMINSIND","BHARATFORG","BOSCHLTD",
  "MOTHERSON","TVSMOTOR","ASHOKLEY","MRF","BALKRISIND","DLF","GODREJPROP",
  "OBEROIRLTY","PRESTIGE","PHOENIXLTD","INDIGO","SPICEJET","CONCOR","BSE",
  "CDSL","MCX","ANGELONE","POLYCAB","DIXON","KAYNES","ZOMATO","PVRINOX",
  "TATACOMM",
];

interface Watchlist {
  id: number;
  name: string;
  stocks: string[];
}

interface Props { onSelectStock?: (ticker: string) => void; }

export default function WatchlistPanel({ onSelectStock }: Props) {
  const [authed, setAuthed] = useState(false);
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial load: check auth then fetch lists (auto-creating a default if empty)
  useEffect(() => {
    setAuthed(isLoggedIn());
    if (!isLoggedIn()) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        let data = await apiJson<Watchlist[]>("/watchlists");
        if (data.length === 0) {
          // First-time user: seed an empty default list so they have something to add to
          const created = await apiJson<Watchlist>("/watchlists", {
            method: "POST",
            body: JSON.stringify({ name: "My Portfolio", stocks: "" }),
          });
          data = [created];
        }
        if (!cancelled) {
          setLists(data);
          setActiveId(data[0].id);
        }
      } catch (e: any) {
        if (e instanceof AuthError) return; // already redirected
        if (!cancelled) setError(e.message || "Failed to load watchlists");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const active = lists.find((l) => l.id === activeId) || null;
  const suggestions = NIFTY_STOCKS.filter(
    (s) => s.includes(search.toUpperCase()) && !active?.stocks.includes(s)
  );

  const addStock = async (ticker: string) => {
    if (!active) return;
    // Optimistic update
    const upper = ticker.toUpperCase();
    setLists((p) => p.map((l) => l.id === active.id ? { ...l, stocks: [...l.stocks, upper] } : l));
    setSearch(""); setAdding(false);
    try {
      const r = await apiJson<{ stocks: string[] }>(
        `/watchlists/${active.id}/add?ticker=${encodeURIComponent(upper)}`,
        { method: "POST" }
      );
      setLists((p) => p.map((l) => l.id === active.id ? { ...l, stocks: r.stocks } : l));
    } catch (e: any) {
      if (e instanceof AuthError) return;
      setError(e.message || "Failed to add stock");
    }
  };

  const removeStock = async (ticker: string) => {
    if (!active) return;
    const upper = ticker.toUpperCase();
    setLists((p) => p.map((l) => l.id === active.id ? { ...l, stocks: l.stocks.filter((s) => s !== upper) } : l));
    try {
      await apiJson(`/watchlists/${active.id}/remove?ticker=${encodeURIComponent(upper)}`, { method: "POST" });
    } catch (e: any) {
      if (e instanceof AuthError) return;
      setError(e.message || "Failed to remove stock");
    }
  };

  const createList = async () => {
    const name = newListName.trim();
    if (!name) return;
    try {
      const created = await apiJson<Watchlist>("/watchlists", {
        method: "POST",
        body: JSON.stringify({ name, stocks: "" }),
      });
      setLists((p) => [...p, created]);
      setActiveId(created.id);
      setNewListName("");
      setCreatingList(false);
    } catch (e: any) {
      if (e instanceof AuthError) return;
      setError(e.message || "Failed to create list");
    }
  };

  const deleteList = async () => {
    if (!active) return;
    if (lists.length <= 1) {
      setError("At least one list is required");
      return;
    }
    if (!window.confirm(`Delete list "${active.name}"?`)) return;
    const deletingId = active.id;
    try {
      await apiJson(`/watchlists/${deletingId}`, { method: "DELETE" });
      setLists((p) => {
        const next = p.filter((l) => l.id !== deletingId);
        setActiveId(next[0]?.id ?? null);
        return next;
      });
    } catch (e: any) {
      if (e instanceof AuthError) return;
      setError(e.message || "Failed to delete list");
    }
  };

  // ── Unauthenticated state ────────────────────────────────────────────────
  if (!authed && !loading) {
    return (
      <div>
        <h2 style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)", marginBottom: 12, transition: "color 0.2s ease" }}>
          Watchlist
        </h2>
        <div style={{
          padding: 12, borderRadius: 8, border: "1px dashed var(--border)",
          fontSize: 12, color: "var(--muted)", lineHeight: 1.5,
        }}>
          <a href="/login" style={{ color: "var(--fg)", fontWeight: 500, textDecoration: "underline" }}>
            Log in
          </a>{" "}
          to save your watchlist and keep it across sessions.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)", transition: "color 0.2s ease" }}>Watchlist</h2>
        {active && lists.length > 1 && (
          <button
            onClick={deleteList}
            title={`Delete "${active.name}"`}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 11, padding: 0 }}
          >
            Delete list
          </button>
        )}
      </div>

      {/* Tabs */}
      {lists.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
          {lists.map((l) => (
            <button
              key={l.id}
              onClick={() => setActiveId(l.id)}
              style={{
                fontSize: 11, padding: "2px 8px", border: "1px solid", borderRadius: 4, cursor: "pointer",
                background: activeId === l.id ? "var(--fg)" : "none",
                color: activeId === l.id ? "var(--bg)" : "var(--muted)",
                borderColor: activeId === l.id ? "var(--fg)" : "var(--border)",
                transition: "all 0.2s ease",
              }}
            >
              {l.name}
            </button>
          ))}
          {/* New list trigger */}
          {!creatingList && (
            <button
              onClick={() => setCreatingList(true)}
              title="New list"
              style={{
                fontSize: 11, padding: "2px 6px", border: "1px dashed var(--border)", borderRadius: 4,
                cursor: "pointer", background: "none", color: "var(--muted)",
                display: "flex", alignItems: "center",
              }}
            >
              <Plus size={11} />
            </button>
          )}
        </div>
      )}

      {/* New list form */}
      {creatingList && (
        <div style={{ marginBottom: 12 }}>
          <input
            autoFocus
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createList(); if (e.key === "Escape") { setCreatingList(false); setNewListName(""); } }}
            placeholder="List name…"
            style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, outline: "none", background: "var(--bg)", color: "var(--fg)" }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={createList} style={{ fontSize: 11, padding: "3px 8px", background: "var(--fg)", color: "var(--bg)", border: "none", borderRadius: 4, cursor: "pointer" }}>
              Create
            </button>
            <button onClick={() => { setCreatingList(false); setNewListName(""); }} style={{ fontSize: 11, color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>Loading…</p>
      )}

      {/* Stocks */}
      {!loading && active && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {active.stocks.map((ticker) => (
            <div
              key={ticker}
              onClick={() => onSelectStock?.(ticker)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 0", borderBottom: "1px solid var(--border)",
                cursor: "pointer", transition: "border-color 0.2s ease",
              }}
            >
              <span style={{ fontWeight: 500, fontSize: 13, color: "var(--fg)" }}>{ticker}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--green)" }}>+0.42%</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeStock(ticker); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 0, display: "flex" }}
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
          {active.stocks.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0", fontStyle: "italic" }}>
              No stocks yet — add one below.
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{ fontSize: 11, color: "#ef4444", marginTop: 8 }}>{error}</p>
      )}

      {/* Add stock */}
      {!loading && active && (
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
                onKeyDown={(e) => { if (e.key === "Escape") setAdding(false); }}
                style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, outline: "none", background: "var(--bg)", color: "var(--fg)", transition: "all 0.2s ease" }}
              />
              {search.length > 0 && suggestions.length > 0 && (
                <div style={{ border: "1px solid var(--border)", borderRadius: 4, marginTop: 4, overflow: "hidden", background: "var(--bg)" }}>
                  {suggestions.slice(0, 5).map((s) => (
                    <button
                      key={s}
                      onClick={() => addStock(s)}
                      style={{ width: "100%", textAlign: "left", padding: "6px 8px", fontSize: 12, background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--border)", color: "var(--fg)", transition: "all 0.2s ease" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setAdding(false)} style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, background: "none", border: "none", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              id="add-stock-btn"
              onClick={() => setAdding(true)}
              style={{ fontSize: 12, color: "var(--muted)", background: "none", border: "1px dashed var(--border)", borderRadius: 4, padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s ease" }}
            >
              <Plus size={12} /> Add stock
            </button>
          )}
        </div>
      )}
    </div>
  );
}
