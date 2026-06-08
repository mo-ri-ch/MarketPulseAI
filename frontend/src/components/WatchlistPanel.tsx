"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { apiJson, isLoggedIn, AuthError } from "@/lib/api";
import { getQuoteSnapshot, publishQuotes, useQuoteVersion } from "@/lib/quoteStore";
import PriceAlertSettings from "./PriceAlertSettings";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
// 1 s cadence so the row's percent-change moves in step with the chart
// instead of lagging it by up to ten seconds.
const QUOTES_POLL_MS = 1_000;

interface Quote {
  ticker: string;
  value: number;
  change: number;
  change_pct: number;
  up: boolean;
}

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
  "TATACOMM","TTML","TATAGOLD","TATSILV",
];

interface Watchlist {
  id: number;
  name: string;
  stocks: string[];
}

export interface PortfolioSummary {
  id: number;
  name: string;
  tickers: string[];
}

interface Props {
  onSelectStock?: (ticker: string) => void;
  onPortfoliosChange?: (portfolios: PortfolioSummary[]) => void;
}

export default function WatchlistPanel({ onSelectStock, onPortfoliosChange }: Props) {
  const [authed, setAuthed] = useState(false);
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  // Re-render the row whenever any source publishes into the shared quote
  // store — keeps this column in lock-step with the chart's faster ticks.
  useQuoteVersion();
  // Used to detect when the active list's tickers actually change, so the
  // polling effect doesn't re-fetch on every render.
  const tickersKeyRef = useRef<string>("");

  // ── WhatsApp alert state ─────────────────────────────────────────────────
  const [waConfigured, setWaConfigured]   = useState(false);
  const [waMasked, setWaMasked]           = useState("");
  const [waEnabled, setWaEnabled]         = useState(false);
  const [waPhone, setWaPhone]             = useState("");
  const [waEditing, setWaEditing]         = useState(false);
  const [waSaving, setWaSaving]           = useState(false);
  const [waMsg, setWaMsg]                 = useState<{ text: string; ok: boolean } | null>(null);

  const loadWhatsAppSettings = useCallback(async () => {
    try {
      const d = await apiJson<{ configured: boolean; phone_number_masked: string; enabled: boolean }>(
        "/user/whatsapp"
      );
      setWaConfigured(d.configured);
      setWaMasked(d.phone_number_masked);
      setWaEnabled(d.enabled);
    } catch {
      // Not critical — silently ignore
    }
  }, []);

  const saveWhatsApp = async () => {
    const phone = waPhone.trim();
    if (!phone) return;
    setWaSaving(true);
    setWaMsg(null);
    try {
      const d = await apiJson<{ configured: boolean; phone_number_masked: string; enabled: boolean; message: string }>(
        "/user/whatsapp",
        { method: "PUT", body: JSON.stringify({ phone_number: phone, enabled: true }) }
      );
      setWaConfigured(d.configured);
      setWaMasked(d.phone_number_masked);
      setWaEnabled(d.enabled);
      setWaMsg({ text: "✓ Saved! Alerts are now ON.", ok: true });
      setWaEditing(false);
      setWaPhone("");
    } catch (e: any) {
      setWaMsg({ text: e.message || "Failed to save number", ok: false });
    } finally {
      setWaSaving(false);
    }
  };

  const removeWhatsApp = async () => {
    if (!window.confirm("Remove your WhatsApp number and disable alerts?")) return;
    setWaSaving(true);
    try {
      await apiJson("/user/whatsapp", { method: "DELETE" });
      setWaConfigured(false);
      setWaMasked("");
      setWaEnabled(false);
      setWaEditing(false);
      setWaMsg({ text: "Alerts disabled.", ok: true });
    } catch (e: any) {
      setWaMsg({ text: e.message || "Failed to remove", ok: false });
    } finally {
      setWaSaving(false);
    }
  };

  const toggleWhatsApp = async () => {
    setWaSaving(true);
    try {
      const d = await apiJson<{ enabled: boolean }>(
        "/user/whatsapp",
        { method: "PUT", body: JSON.stringify({ phone_number: waMasked, enabled: !waEnabled }) }
      );
      setWaEnabled(d.enabled);
      setWaMsg({ text: d.enabled ? "✓ Alerts ON" : "Alerts paused", ok: true });
    } catch {
      // ignore
    } finally {
      setWaSaving(false);
    }
  };

  const sendWhatsAppTest = async () => {
    setWaSaving(true);
    setWaMsg({ text: "Sending test message…", ok: true });
    try {
      const d = await apiJson<{
        delivered_per_meta: boolean;
        status_code: number | null;
        meta_response: string;
        error: string | null;
      }>("/user/whatsapp/test", { method: "POST" });
      if (d.delivered_per_meta) {
        setWaMsg({
          text: "✓ Test sent! Check your WhatsApp for the breaking-news template within ~30 seconds.",
          ok: true,
        });
      } else {
        setWaMsg({
          text: `Meta rejected the send (status ${d.status_code ?? "n/a"}). ${d.error || d.meta_response || ""}`.slice(0, 200),
          ok: false,
        });
      }
    } catch (e: any) {
      setWaMsg({ text: e.message || "Test failed", ok: false });
    } finally {
      setWaSaving(false);
    }
  };

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
    // Load WhatsApp settings in parallel
    loadWhatsAppSettings();
    return () => { cancelled = true; };
  }, [loadWhatsAppSettings]);

  const active = lists.find((l) => l.id === activeId) || null;
  const suggestions = NIFTY_STOCKS.filter(
    (s) => s.includes(search.toUpperCase()) && !active?.stocks.includes(s)
  );

  // Poll real per-stock quotes for the active watchlist. Re-fires when the
  // ticker set changes; ticks every QUOTES_POLL_MS while mounted.
  const tickersKey = (active?.stocks ?? []).join(",");

  // Bubble the entire portfolio set up so the dashboard's news header can
  // offer a per-portfolio filter dropdown. We send the whole shape (id,
  // name, tickers) and rebuild it on any structural change.
  const portfoliosKey = lists.map((l) => `${l.id}:${l.name}:${l.stocks.join("|")}`).join(";");
  useEffect(() => {
    onPortfoliosChange?.(
      lists.map((l) => ({ id: l.id, name: l.name, tickers: l.stocks })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfoliosKey]);


  useEffect(() => {
    tickersKeyRef.current = tickersKey;
    if (!tickersKey) {
      setQuotes({});
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(
          `${API}/market/quotes?tickers=${encodeURIComponent(tickersKey)}`,
          { cache: "no-store" },
        );
        if (res.ok && alive && tickersKeyRef.current === tickersKey) {
          const data = (await res.json()) as { quotes: Record<string, Quote> };
          const quotes = data.quotes || {};
          setQuotes(quotes);
          // Push into the shared store so the alert toast / popover for any
          // ticker in this watchlist shows the same number this row shows.
          publishQuotes(
            Object.fromEntries(
              Object.entries(quotes).map(([t, q]) => [
                t,
                {
                  value: q.value,
                  change: q.change,
                  change_pct: q.change_pct,
                  up: q.up,
                  source: "watchlist-poll",
                },
              ]),
            ),
          );
        }
      } catch {
        // Network blip — keep the previous quotes on screen.
      } finally {
        if (alive) timer = setTimeout(tick, QUOTES_POLL_MS);
      }
    };

    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [tickersKey]);

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
                {(() => {
                  // Prefer the shared store so the row matches whatever the
                  // chart is currently showing for this ticker (and falls
                  // back to the slower local poll otherwise).
                  const fresh = getQuoteSnapshot(ticker);
                  const local = quotes[ticker];
                  const value = fresh?.value ?? local?.value;
                  const change = fresh?.change ?? local?.change;
                  const change_pct = fresh?.change_pct ?? local?.change_pct;
                  const up = fresh?.up ?? local?.up;
                  if (value == null || change_pct == null) {
                    return <span style={{ fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>—</span>;
                  }
                  const sign = change_pct >= 0 ? "+" : "";
                  return (
                    <span
                      title={`₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}  (${sign}${(change ?? 0).toFixed(2)})`}
                      style={{
                        fontSize: 12,
                        color: up ? "var(--green)" : "var(--red)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {sign}{change_pct.toFixed(2)}%
                    </span>
                  );
                })()}
                <PriceAlertSettings
                  ticker={ticker}
                  currentPrice={getQuoteSnapshot(ticker)?.value ?? quotes[ticker]?.value}
                />
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

      {/* ── WhatsApp Alerts ──────────────────────────────────────────────── */}
      {authed && (
        <div style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: "1px solid var(--border)",
        }}>
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* WhatsApp SVG icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.523 5.826L.057 23.57a.75.75 0 0 0 .92.92l5.744-1.466A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.734 9.734 0 0 1-4.964-1.357l-.356-.213-3.69.942.977-3.58-.232-.369A9.733 9.733 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
              </svg>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)", transition: "color 0.2s ease" }}>
                WhatsApp Alerts
              </span>
            </div>
            {/* Status badge */}
            {waConfigured && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                background: waEnabled ? "rgba(37,211,102,0.12)" : "var(--border)",
                color: waEnabled ? "#25D366" : "var(--muted)",
                letterSpacing: "0.04em", textTransform: "uppercase",
                transition: "all 0.3s ease",
              }}>
                {waEnabled ? "● ON" : "PAUSED"}
              </span>
            )}
          </div>

          {/* Configured state */}
          {waConfigured && !waEditing && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 10px", borderRadius: 8,
                background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.2)",
              }}>
                <span style={{ fontSize: 12, color: "var(--fg)", fontFamily: "monospace" }}>{waMasked}</span>
                <button
                  onClick={toggleWhatsApp}
                  disabled={waSaving}
                  title={waEnabled ? "Pause alerts" : "Resume alerts"}
                  style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                    border: "none", cursor: "pointer",
                    background: waEnabled ? "rgba(239,68,68,0.1)" : "rgba(37,211,102,0.15)",
                    color: waEnabled ? "#ef4444" : "#25D366",
                    transition: "all 0.2s ease",
                  }}
                >
                  {waSaving ? "…" : waEnabled ? "Pause" : "Resume"}
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => { setWaEditing(true); setWaMsg(null); }}
                  style={{ flex: 1, fontSize: 11, padding: "4px 0", background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--muted)" }}
                >
                  Change number
                </button>
                <button
                  onClick={removeWhatsApp}
                  disabled={waSaving}
                  style={{ flex: 1, fontSize: 11, padding: "4px 0", background: "none", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, cursor: "pointer", color: "#ef4444" }}
                >
                  Remove
                </button>
              </div>
              <button
                onClick={sendWhatsAppTest}
                disabled={waSaving}
                style={{
                  width: "100%", fontSize: 11, fontWeight: 600, padding: "6px 0",
                  background: "rgba(37,211,102,0.1)",
                  color: "#25D366",
                  border: "1px solid rgba(37,211,102,0.3)", borderRadius: 6,
                  cursor: waSaving ? "default" : "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {waSaving ? "Sending…" : "Send test message"}
              </button>
            </div>
          )}

          {/* Not configured / editing state */}
          {(!waConfigured || waEditing) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
                {waConfigured
                  ? "Enter your new WhatsApp number:"
                  : "Get breaking news on WhatsApp automatically whenever MarketPulse finds new articles matching your portfolio."
                }
              </p>
              <input
                type="tel"
                placeholder="+919876543210"
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveWhatsApp(); }}
                style={{
                  width: "100%", padding: "7px 10px",
                  border: "1px solid var(--border)", borderRadius: 6,
                  fontSize: 13, outline: "none",
                  background: "var(--bg)", color: "var(--fg)",
                  fontFamily: "monospace",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s ease",
                }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={saveWhatsApp}
                  disabled={waSaving || !waPhone.trim()}
                  style={{
                    flex: 1, fontSize: 12, fontWeight: 600, padding: "6px 0",
                    background: waPhone.trim() ? "#25D366" : "var(--border)",
                    color: waPhone.trim() ? "#fff" : "var(--muted)",
                    border: "none", borderRadius: 6,
                    cursor: waPhone.trim() ? "pointer" : "default",
                    transition: "all 0.2s ease",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  }}
                >
                  {waSaving ? "Saving…" : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.523 5.826L.057 23.57a.75.75 0 0 0 .92.92l5.744-1.466A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
                      </svg>
                      Enable Alerts
                    </>
                  )}
                </button>
                {waEditing && (
                  <button
                    onClick={() => { setWaEditing(false); setWaPhone(""); setWaMsg(null); }}
                    style={{ fontSize: 11, padding: "6px 10px", background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--muted)" }}
                  >
                    Cancel
                  </button>
                )}
              </div>
              {!waConfigured && (
                <p style={{ fontSize: 10, color: "var(--muted)", margin: 0, lineHeight: 1.4 }}>
                  Include country code, e.g. <span style={{ fontFamily: "monospace" }}>+91</span> for India.{" "}
                  Powered by WhatsApp Cloud API.
                </p>
              )}
            </div>
          )}

          {/* Feedback message */}
          {waMsg && (
            <p style={{
              fontSize: 11, marginTop: 8, padding: "5px 8px", borderRadius: 6,
              background: waMsg.ok ? "rgba(37,211,102,0.08)" : "rgba(239,68,68,0.08)",
              color: waMsg.ok ? "#25D366" : "#ef4444",
              border: `1px solid ${waMsg.ok ? "rgba(37,211,102,0.25)" : "rgba(239,68,68,0.25)"}`,
            }}>
              {waMsg.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

