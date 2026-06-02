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
        <h2 style={{ fontWeight: 600, fontSize: 13, color: "#111" }}>Alerts <span style={{ color: "#9ca3af", fontWeight: 400 }}>({alerts.length})</span></h2>
        <button
          id="new-alert-btn"
          onClick={() => setAdding(!adding)}
          style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
        >
          <Plus size={12} /> New
        </button>
      </div>

      {adding && (
        <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            style={{ width: "100%", padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 12, outline: "none", background: "#fff" }}
          >
            <option>Price</option>
            <option>News</option>
            <option>Sentiment</option>
          </select>
          <input
            placeholder="Ticker (e.g. RELIANCE)"
            value={form.target}
            onChange={(e) => setForm({ ...form, target: e.target.value })}
            style={{ width: "100%", padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 12, outline: "none" }}
          />
          <input
            placeholder="Condition (e.g. price > 2500)"
            value={form.condition}
            onChange={(e) => setForm({ ...form, condition: e.target.value })}
            style={{ width: "100%", padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 12, outline: "none" }}
          />
          <button
            onClick={addAlert}
            style={{ padding: "6px", background: "#111", color: "#fff", border: "none", borderRadius: 4, fontSize: 12, cursor: "pointer" }}
          >
            Create
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {alerts.map((alert) => (
          <div key={alert.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
            <div>
              <span style={{ fontWeight: 500, fontSize: 13 }}>{alert.target}</span>
              <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>{alert.type} · {alert.condition}</span>
            </div>
            <button
              onClick={() => removeAlert(alert.id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", padding: 0, display: "flex" }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
