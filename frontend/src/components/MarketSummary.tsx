"use client";

const INDICES = [
  { name: "NIFTY 50",   value: "24,302.15", change: "+0.43%", up: true  },
  { name: "SENSEX",     value: "79,894.40", change: "+0.38%", up: true  },
  { name: "BANK NIFTY", value: "52,317.80", change: "-0.12%", up: false },
  { name: "NIFTY IT",   value: "38,912.60", change: "+1.02%", up: true  },
  { name: "NIFTY MID",  value: "50,125.00", change: "+0.56%", up: true  },
  { name: "VIX",        value: "13.42",     change: "-2.10%", up: false },
];

export default function MarketSummary() {
  return (
    <div style={{ borderBottom: "1px solid #e5e7eb", display: "flex", gap: 32, padding: "12px 24px", overflowX: "auto" }}>
      {INDICES.map((idx) => (
        <div key={idx.name} style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>{idx.name}</div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{idx.value}</div>
          <div style={{ fontSize: 12, color: idx.up ? "#16a34a" : "#dc2626" }}>{idx.change}</div>
        </div>
      ))}
    </div>
  );
}
