"use client";

import { Bell, Plus, X, TrendingUp, Newspaper, Activity } from "lucide-react";
import { useState } from "react";

const ICON_MAP: Record<string, any> = {
  PRICE:     TrendingUp,
  NEWS:      Newspaper,
  SENTIMENT: Activity,
};

const COLOR_MAP: Record<string, string> = {
  PRICE:     "text-blue-400 bg-blue-400/10",
  NEWS:      "text-yellow-400 bg-yellow-400/10",
  SENTIMENT: "text-purple-400 bg-purple-400/10",
};

const MOCK_ALERTS = [
  { id: 1, type: "PRICE",     target: "HDFCBANK", condition: "price > ₹1,800", active: true  },
  { id: 2, type: "NEWS",      target: "TCS",      condition: "breaking news",   active: true  },
  { id: 3, type: "SENTIMENT", target: "*",        condition: "sentiment = bearish", active: true },
];

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState(MOCK_ALERTS);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ type: "PRICE", target: "", condition: "" });

  const removeAlert = (id: number) =>
    setAlerts((prev) => prev.filter((a) => a.id !== id));

  const addAlert = () => {
    if (!form.target || !form.condition) return;
    setAlerts((prev) => [
      ...prev,
      { id: Date.now(), type: form.type, target: form.target.toUpperCase(), condition: form.condition, active: true },
    ]);
    setForm({ type: "PRICE", target: "", condition: "" });
    setAdding(false);
  };

  return (
    <div className="rounded-2xl border border-card-border bg-card/50 backdrop-blur-sm">
      <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Alerts</h2>
          <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
            {alerts.length}
          </span>
        </div>
        <button
          id="new-alert-btn"
          onClick={() => setAdding(!adding)}
          className="text-xs text-muted hover:text-primary transition-colors flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="p-4 border-b border-card-border space-y-2">
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="w-full text-xs px-3 py-2 bg-accent/50 border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="PRICE">Price Movement</option>
            <option value="NEWS">Breaking News</option>
            <option value="SENTIMENT">Sentiment Change</option>
          </select>
          <input
            placeholder="Ticker (e.g. RELIANCE or *)"
            value={form.target}
            onChange={(e) => setForm({ ...form, target: e.target.value })}
            className="w-full text-xs px-3 py-2 bg-accent/50 border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <input
            placeholder="Condition (e.g. price > 2500)"
            value={form.condition}
            onChange={(e) => setForm({ ...form, condition: e.target.value })}
            className="w-full text-xs px-3 py-2 bg-accent/50 border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={addAlert}
            className="w-full py-1.5 bg-primary hover:bg-blue-600 text-white text-xs rounded-lg transition-colors"
          >
            Create Alert
          </button>
        </div>
      )}

      {/* Alert list */}
      <div className="divide-y divide-card-border/50">
        {alerts.map((alert) => {
          const Icon = ICON_MAP[alert.type] ?? Bell;
          const color = COLOR_MAP[alert.type] ?? "text-muted bg-muted/10";
          return (
            <div key={alert.id} className="px-4 py-3 flex items-start gap-3 group hover:bg-accent/20 transition-colors">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">{alert.target}</p>
                <p className="text-xs text-muted truncate">{alert.condition}</p>
              </div>
              <button
                onClick={() => removeAlert(alert.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-red-400 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
