"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

const MOCK_ALERTS = [
  { id: 1, type: "Price",     target: "HDFCBANK", condition: "price > ₹1,800"   },
  { id: 2, type: "News",      target: "TCS",      condition: "breaking news"     },
  { id: 3, type: "Sentiment", target: "Any",      condition: "sentiment = bearish" },
];

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState(MOCK_ALERTS);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ type: "Price", target: "", condition: "" });

  const removeAlert = (id: number) => setAlerts((p) => p.filter((a) => a.id !== id));

  const addAlert = () => {
    if (!form.target || !form.condition) return;
    setAlerts((p) => [...p, { id: Date.now(), ...form, target: form.target.toUpperCase() }]);
    setForm({ type: "Price", target: "", condition: "" });
    setAdding(false);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)", transition: "color 0.2s ease" }}>Alerts <span style={{ color: "var(--muted)", fontWeight: 400, transition: "color 0.2s ease" }}>({alerts.length})</span></h2>
        <button
          id="new-alert-btn"
          onClick={() => setAdding(!adding)}
          style={{ fontSize: 11, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 3, transition: "color 0.2s ease" }}
        >
          <Plus size={12} /> New
        </button>
      </div>

      {adding && (
        <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, outline: "none", background: "var(--bg)", color: "var(--fg)", transition: "all 0.2s ease" }}
          >
            <option>Price</option>
            <option>News</option>
            <option>Sentiment</option>
          </select>
          <input
            placeholder="Ticker (e.g. RELIANCE)"
            value={form.target}
            onChange={(e) => setForm({ ...form, target: e.target.value })}
            style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, outline: "none", background: "var(--bg)", color: "var(--fg)", transition: "all 0.2s ease" }}
          />
          <input
            placeholder="Condition (e.g. price > 2500)"
            value={form.condition}
            onChange={(e) => setForm({ ...form, condition: e.target.value })}
            style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, outline: "none", background: "var(--bg)", color: "var(--fg)", transition: "all 0.2s ease" }}
          />
          <button
            onClick={addAlert}
            style={{ padding: "6px", background: "var(--fg)", color: "var(--bg)", border: "none", borderRadius: 4, fontSize: 12, cursor: "pointer", transition: "all 0.2s ease" }}
          >
            Create
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {alerts.map((alert) => (
          <div key={alert.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", transition: "border-color 0.2s ease" }}>
            <div>
              <span style={{ fontWeight: 500, fontSize: 13, color: "var(--fg)" }}>{alert.target}</span>
              <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6, transition: "color 0.2s ease" }}>{alert.type} · {alert.condition}</span>
            </div>
            <button
              onClick={() => removeAlert(alert.id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 0, display: "flex", transition: "color 0.2s ease" }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
