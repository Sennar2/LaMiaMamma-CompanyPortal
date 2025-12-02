// src/components/financial/ComplianceBar.tsx

import React from "react";

type InsightsShape = {
  wkLabel: string; // e.g. "W43"
  salesActual: number;
  salesBudget: number;
  salesVar: number;
  salesVarPct: number;
  payrollPct: number;
  foodPct: number;
  drinkPct: number;
  salesVsLastYearPct: number;
  avgPayrollVar4w: number; // last-4-week avg of Payroll_v%
  currentWeekLabel?: string;
};

type ComplianceBarProps = {
  insights: InsightsShape | null;
  payrollTarget: number;
  foodTarget: number;
  drinkTarget: number;
  complianceSnapshot?: InsightsShape | null;
};

export default function ComplianceBar({
  insights,
  payrollTarget,
  foodTarget,
  drinkTarget,
  complianceSnapshot,
}: ComplianceBarProps) {
  const snapshot = complianceSnapshot ?? insights;

  if (!snapshot) {
    return (
      <section
        style={{
          maxWidth: "1280px",
          margin: "1rem auto",
          padding: "1rem",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: "0.8rem",
          color: "#6b7280",
          textAlign: "center",
        }}
      >
        No data available.
      </section>
    );
  }

  const {
    wkLabel,
    salesActual,
    payrollPct,
    foodPct,
    drinkPct,
    salesVsLastYearPct,
    avgPayrollVar4w,
  } = snapshot;

  // ───────────────── helpers ─────────────────

  function formatCurrency(val: number | undefined | null) {
    if (val == null || Number.isNaN(val)) return "£0";
    return (
      "£" +
      Math.round(Number(val)).toLocaleString("en-GB", {
        maximumFractionDigits: 0,
      })
    );
  }

  function spendLine(pctVal: number | undefined | null) {
    if (!salesActual || salesActual === 0) return "Cost: no sales data";
    if (pctVal == null || Number.isNaN(pctVal)) return "Cost: no cost data";

    const amount = (salesActual * pctVal) / 100;
    return `Cost: ≈ ${formatCurrency(amount)} on ${formatCurrency(
      salesActual
    )} sales`;
  }

  function salesVsLyLine() {
    const p = salesVsLastYearPct;
    if (p == null || Number.isNaN(p) || !salesActual) {
      return "No LY data";
    }

    // p = (A - LY) / LY * 100  =>  LY = A / (1 + p/100)
    const ratio = 1 + p / 100;
    if (ratio === 0) return "No LY data";

    const ly = salesActual / ratio;
    const diff = salesActual - ly;
    const sign = diff >= 0 ? "+" : "";
    return `${sign}${formatCurrency(diff)} vs LY`;
  }

  function pct(val: number | undefined | null) {
    if (val === undefined || val === null || Number.isNaN(val)) {
      return "0.0%";
    }
    return `${Number(val).toFixed(1)}%`;
  }

  // ───────── traffic-light dot for Payroll 4-week trend ─────────
  // avgPayrollVar4w is "average % vs target"
  // rule:
  //   avg ≤ +1%         -> green
  //   +1% < avg ≤ +2%   -> amber
  //   avg > +2%         -> red
  // (negative values = under target = always green)
  const avgVar = avgPayrollVar4w ?? 0;

  let trendDotColor = "#10B981"; // green
  if (avgVar > 1 && avgVar <= 2) {
    trendDotColor = "#FACC15"; // amber
  } else if (avgVar > 2) {
    trendDotColor = "#EF4444"; // red
  }

  const trendText =
    avgVar >= 0
      ? `${avgVar.toFixed(1)} pts over target (4-week avg)`
      : `${Math.abs(avgVar).toFixed(1)} pts under target (4-week avg)`;

  // statuses
  const payrollIsOk = payrollPct <= payrollTarget;
  const foodIsOk = foodPct <= foodTarget;
  const drinkIsOk = drinkPct <= drinkTarget;
  const salesVsLyOk = (salesVsLastYearPct ?? 0) >= 0;

  // ───────────────── styles ─────────────────

  const cardBase: React.CSSProperties = {
    backgroundColor: "#fff",
    borderRadius: "0.75rem",
    boxShadow:
      "0 24px 40px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
    padding: "1rem 1.25rem",
    flex: "1 1 220px",
    minWidth: "220px",
    fontFamily: "Inter, system-ui, sans-serif",
  };

  const headerRow: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.4rem",
    fontSize: "0.75rem",
  };

  const titleStyle: React.CSSProperties = {
    fontWeight: 600,
    color: "#111827",
  };

  const weekChip: React.CSSProperties = {
    fontSize: "0.7rem",
    padding: "0.15rem 0.55rem",
    borderRadius: "999px",
    backgroundColor: "#f3f4f6",
    color: "#374151",
    whiteSpace: "nowrap",
  };

  const bigValueBase: React.CSSProperties = {
    fontSize: "1.25rem",
    fontWeight: 700,
    lineHeight: 1.1,
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  };

  const bigValueGood: React.CSSProperties = {
    ...bigValueBase,
    color: "#16a34a",
  };

  const bigValueBad: React.CSSProperties = {
    ...bigValueBase,
    color: "#dc2626",
  };

  const statusPillBase: React.CSSProperties = {
    fontSize: "0.65rem",
    fontWeight: 600,
    padding: "0.15rem 0.6rem",
    borderRadius: "999px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };

  const statusPillGood: React.CSSProperties = {
    ...statusPillBase,
    backgroundColor: "rgba(22,163,74,0.08)",
    color: "#15803d",
  };

  const statusPillBad: React.CSSProperties = {
    ...statusPillBase,
    backgroundColor: "rgba(220,38,38,0.06)",
    color: "#b91c1c",
  };

  const subLine: React.CSSProperties = {
    marginTop: "0.25rem",
    fontSize: "0.75rem",
    color: "#6b7280",
  };

  const trendRow: React.CSSProperties = {
    marginTop: "0.35rem",
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    fontSize: "0.72rem",
    color: "#4b5563",
  };

  const dotStyle: React.CSSProperties = {
    width: "10px",
    height: "10px",
    borderRadius: "999px",
    backgroundColor: trendDotColor,
    boxShadow: "0 0 3px rgba(0,0,0,0.2)",
    flexShrink: 0,
  };

  return (
    <section
      style={{
        maxWidth: "1280px",
        margin: "1rem auto 0",
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Payroll card */}
      <div style={cardBase}>
        <div style={headerRow}>
          <span style={titleStyle}>Payroll %</span>
          <span style={weekChip}>{wkLabel}</span>
        </div>

        <div style={payrollIsOk ? bigValueGood : bigValueBad}>
          <span>{pct(payrollPct)}</span>
          <span
            style={payrollIsOk ? statusPillGood : statusPillBad}
          >
            {payrollIsOk ? "On target" : "Off target"}
          </span>
        </div>

        <div style={subLine}>Target ≤ {payrollTarget}%</div>
        <div style={subLine}>{spendLine(payrollPct)}</div>

        <div style={trendRow}>
          <span style={dotStyle} />
          <span>{trendText}</span>
        </div>
      </div>

      {/* Food card */}
      <div style={cardBase}>
        <div style={headerRow}>
          <span style={titleStyle}>Food %</span>
          <span style={weekChip}>{wkLabel}</span>
        </div>

        <div style={foodIsOk ? bigValueGood : bigValueBad}>
          <span>{pct(foodPct)}</span>
          <span style={foodIsOk ? statusPillGood : statusPillBad}>
            {foodIsOk ? "On target" : "Off target"}
          </span>
        </div>

        <div style={subLine}>Target ≤ {foodTarget}%</div>
        <div style={subLine}>{spendLine(foodPct)}</div>
      </div>

      {/* Drink card */}
      <div style={cardBase}>
        <div style={headerRow}>
          <span style={titleStyle}>Drink %</span>
          <span style={weekChip}>{wkLabel}</span>
        </div>

        <div style={drinkIsOk ? bigValueGood : bigValueBad}>
          <span>{pct(drinkPct)}</span>
          <span style={drinkIsOk ? statusPillGood : statusPillBad}>
            {drinkIsOk ? "On target" : "Off target"}
          </span>
        </div>

        <div style={subLine}>Target ≤ {drinkTarget}%</div>
        <div style={subLine}>{spendLine(drinkPct)}</div>
      </div>

      {/* Sales vs LY card */}
      <div style={cardBase}>
        <div style={headerRow}>
          <span style={titleStyle}>Sales vs LY</span>
          <span style={weekChip}>{wkLabel}</span>
        </div>

        <div style={salesVsLyOk ? bigValueGood : bigValueBad}>
          <span>{pct(salesVsLastYearPct)}</span>
          <span style={salesVsLyOk ? statusPillGood : statusPillBad}>
            {salesVsLyOk ? "On target" : "Below LY"}
          </span>
        </div>

        <div style={subLine}>Target ≥ 0%</div>
        <div style={subLine}>{salesVsLyLine()}</div>
      </div>
    </section>
  );
}
