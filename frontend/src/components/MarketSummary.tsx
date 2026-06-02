"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const INDICES = [
  { name: "NIFTY 50",    value: "24,302.15", change: "+0.43%", up: true  },
  { name: "SENSEX",      value: "79,894.40", change: "+0.38%", up: true  },
  { name: "BANK NIFTY",  value: "52,317.80", change: "-0.12%", up: false },
  { name: "NIFTY IT",    value: "38,912.60", change: "+1.02%", up: true  },
  { name: "NIFTY MID",   value: "50,125.00", change: "+0.56%", up: true  },
  { name: "VIX",         value: "13.42",     change: "-2.10%", up: false },
];

export default function MarketSummary() {
  return (
    <div className="rounded-2xl border border-card-border bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Section title */}
      <div className="px-5 py-3 border-b border-card-border flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
        <h2 className="text-sm font-semibold text-foreground/80 uppercase tracking-widest">
          Market Overview
        </h2>
        <span className="ml-auto text-xs text-muted">NSE · Live</span>
      </div>

      {/* Indices ticker */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y divide-card-border">
        {INDICES.map((idx) => (
          <div key={idx.name} className="px-4 py-3 group hover:bg-accent/30 transition-colors">
            <p className="text-xs text-muted mb-1">{idx.name}</p>
            <p className="text-base font-bold">{idx.value}</p>
            <div
              className={`flex items-center gap-1 text-xs font-medium mt-0.5 ${
                idx.up ? "text-green-400" : "text-red-400"
              }`}
            >
              {idx.up ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {idx.change}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
