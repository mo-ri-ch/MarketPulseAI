"use client";

import { useState, useEffect } from "react";
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  CheckCircle2, 
  AlertTriangle, 
  ExternalLink,
  Loader2,
  Calendar,
  Sparkles
} from "lucide-react";

// Per-source color palette for badges (same as BreakingNews)
const SOURCE_COLORS: Record<string, string> = {
  "NSE India":         "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "Moneycontrol":      "bg-orange-500/15 text-orange-400 border-orange-500/20",
  "Reuters":           "bg-red-500/15 text-red-400 border-red-500/20",
  "TradingView":       "bg-sky-500/15 text-sky-400 border-sky-500/20",
  "Motilal Oswal":     "bg-purple-500/15 text-purple-400 border-purple-500/20",
  "Yahoo Finance":     "bg-violet-500/15 text-violet-400 border-violet-500/20",
  "Economic Times":    "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  "LiveMint":          "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  "Business Standard": "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  "CNBC TV18":         "bg-rose-500/15 text-rose-400 border-rose-500/20",
  "Reddit":            "bg-orange-600/15 text-orange-500 border-orange-600/20",
  "FrontPage":         "bg-teal-500/15 text-teal-400 border-teal-500/20",
};

interface Props {
  ticker: string;
  onClose: () => void;
}

export default function StockAnalysisModal({ ticker, onClose }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`http://localhost:8000/stocks/${ticker}/analysis`);
        if (!res.ok) {
          throw new Error("Failed to fetch stock analysis details.");
        }
        const json = await res.json();
        if (active) {
          setData(json);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || "An unexpected error occurred.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [ticker]);

  // Handle ESC key press to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const getDirectionDetails = (direction: string) => {
    switch (direction?.toUpperCase()) {
      case "UP":
        return {
          icon: TrendingUp,
          label: "Bullish",
          badgeClass: "bg-green-500/15 text-green-400 border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.15)]",
          barColor: "bg-green-500",
          textColor: "text-green-400"
        };
      case "DOWN":
        return {
          icon: TrendingDown,
          label: "Bearish",
          badgeClass: "bg-red-500/15 text-red-400 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)]",
          barColor: "bg-red-500",
          textColor: "text-red-400"
        };
      default:
        return {
          icon: Minus,
          label: "Neutral",
          badgeClass: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.15)]",
          barColor: "bg-yellow-500",
          textColor: "text-yellow-400"
        };
    }
  };

  const dirDetails = data ? getDirectionDetails(data.prediction?.direction) : null;
  const confidencePercent = data ? Math.round(data.prediction?.confidence * 100) : 50;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Content container */}
      <div className="relative w-full max-w-3xl bg-card border border-card-border rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh] transition-all duration-300 scale-100 z-10 animate-[fadeIn_0.2s_ease-out]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-card-border flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>{data?.company_name || ticker}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-accent border border-card-border font-mono font-normal text-muted">
                {ticker}
              </span>
            </h2>
            <p className="text-xs text-muted">Stock Sentiment & Prediction analysis</p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted animate-pulse">Running predictive AI models and parsing news...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-400">Analysis Fetch Failed</p>
                <p className="text-xs text-muted mt-1">{error}</p>
                <button 
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    // Trigger effect again by resetting key
                    onClose();
                  }}
                  className="text-xs text-primary underline mt-2 hover:text-blue-300 block"
                >
                  Close & Try again
                </button>
              </div>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Row 1: Prediction Widget */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                
                {/* Direction Card */}
                <div className="md:col-span-1 p-5 rounded-2xl border border-card-border bg-accent/20 flex flex-col justify-center items-center text-center space-y-3">
                  <span className="text-xs text-muted uppercase font-bold tracking-wider">Next Day Outlook</span>
                  <div className={`px-4 py-3 rounded-2xl border flex flex-col items-center gap-1.5 ${dirDetails?.badgeClass}`}>
                    {dirDetails && <dirDetails.icon className="w-8 h-8" />}
                    <span className="text-lg font-black tracking-tight">{dirDetails?.label}</span>
                  </div>
                </div>

                {/* Confidence & Rationale Card */}
                <div className="md:col-span-2 p-5 rounded-2xl border border-card-border bg-accent/20 flex flex-col justify-between space-y-4">
                  {/* Confidence meter */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted font-medium">Prediction Confidence</span>
                      <span className={`font-semibold ${dirDetails?.textColor}`}>{confidencePercent}%</span>
                    </div>
                    <div className="h-2 w-full bg-card border border-card-border rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${dirDetails?.barColor} transition-all duration-1000`} 
                        style={{ width: `${confidencePercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Rationale */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted uppercase font-bold tracking-wider">Analysis Rationale</span>
                    <p className="text-xs text-foreground/80 leading-relaxed italic">
                      "{data.prediction?.rationale}"
                    </p>
                  </div>
                </div>
              </div>

              {/* Row 2: AI Summary Panel */}
              <div className="p-5 rounded-2xl border border-card-border bg-accent/25 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Consolidated AI Insight</span>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed">
                  {data.analysis?.summary}
                </p>
              </div>

              {/* Row 3: Key Catalysts (Drivers vs Risks) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Positive Drivers */}
                <div className="p-5 rounded-2xl border border-card-border bg-green-500/5 space-y-3">
                  <div className="flex items-center gap-2 border-b border-card-border/50 pb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <h3 className="font-semibold text-sm text-green-400">Bullish Catalysts (Drivers)</h3>
                  </div>
                  <ul className="space-y-2">
                    {(data.analysis?.key_drivers || []).map((driver: string, index: number) => (
                      <li key={index} className="text-xs text-foreground/80 flex items-start gap-2 leading-relaxed">
                        <span className="text-green-500/70 font-semibold shrink-0 select-none mt-0.5">•</span>
                        <span>{driver}</span>
                      </li>
                    ))}
                    {(data.analysis?.key_drivers || []).length === 0 && (
                      <p className="text-xs text-muted italic">No immediate positive drivers identified.</p>
                    )}
                  </ul>
                </div>

                {/* Risks / Negatives */}
                <div className="p-5 rounded-2xl border border-card-border bg-red-500/5 space-y-3">
                  <div className="flex items-center gap-2 border-b border-card-border/50 pb-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <h3 className="font-semibold text-sm text-red-400">Bearish Catalysts (Risks)</h3>
                  </div>
                  <ul className="space-y-2">
                    {(data.analysis?.key_risks || []).map((risk: string, index: number) => (
                      <li key={index} className="text-xs text-foreground/80 flex items-start gap-2 leading-relaxed">
                        <span className="text-red-500/70 font-semibold shrink-0 select-none mt-0.5">•</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                    {(data.analysis?.key_risks || []).length === 0 && (
                      <p className="text-xs text-muted italic">No immediate risks identified.</p>
                    )}
                  </ul>
                </div>
              </div>

              {/* Row 4: Referenced News Articles */}
              <div className="space-y-3">
                <div className="border-b border-card-border pb-2 flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Supporting News References</h3>
                  <span className="text-xs text-muted">({(data.articles || []).length} articles evaluated)</span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(data.articles || []).map((article: any, index: number) => {
                    const sourceCls = SOURCE_COLORS[article.source] ?? "bg-accent text-muted border-card-border";
                    return (
                      <div 
                        key={article.id || index}
                        className="p-3 rounded-xl border border-card-border/50 bg-accent/10 hover:bg-accent/25 hover:border-card-border transition-all flex items-start justify-between gap-4 group"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <a 
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold hover:text-primary transition-colors block leading-normal min-w-0 truncate"
                            title={article.headline}
                          >
                            {article.headline}
                          </a>
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${sourceCls}`}>
                              {article.source}
                            </span>
                            {article.published_at && (
                              <span className="text-[10px] text-muted flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(article.published_at).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                        <a 
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-primary p-1 shrink-0"
                          title="Open article in a new tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    );
                  })}
                  {(data.articles || []).length === 0 && (
                    <p className="text-xs text-muted italic py-4 text-center">
                      No matching news articles found in the database to compile predictions.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

        </div>

      </div>
    </div>
  );
}
