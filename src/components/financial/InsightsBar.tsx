// src/components/financial/InsightsBar.tsx

import React from "react";

type InsightsShape = {
  wkLabel: string; // e.g. "W48"
  salesActual: number;
  salesBudget: number;
  salesVar: number;
  salesVarPct: number;
  payrollPct: number;
  foodPct: number;
  drinkPct: number;
  salesVsLastYearPct: number;
  avgPayrollVar4w: number;
  currentWeekLabel?: string;
};

type InsightsBarProps = {
  insights: InsightsShape | null;
  payrollTarget: number; // still passed in, but not used here
  currentWeekNow: string;
};

export default function InsightsBar({
  insights,
  payrollTarget: _payrollTarget, // keep prop for compatibility
  currentWeekNow,
}: InsightsBarProps) {
  // helpers
  function formatCurrency(val: number | undefined | null) {
    if (val == null || Number.isNaN(val)) return "£0";
    const abs = Math.abs(Number(val));
    return (
      "£" +
      abs.toLocaleString("en-GB", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      })
    );
  }

  function percentText(val: number | undefined | null) {
    if (val == null || Number.isNaN(val)) return "0.0%";
    return `${val.toFixed(1)}%`;
  }

  // layout styles
  const containerStyle: React.CSSProperties = {
    maxWidth: "1280px",
    margin: "0.75rem auto 0", // a bit more space from controls
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
    gap: "1.25rem",
    fontFamily: "Inter, system-ui, sans-serif",
  };

  const cardBase: React.CSSProperties = {
    backgroundColor: "#ffffff",
    borderRadius: "0.9rem",
    boxShadow:
      "0 24px 40px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
    padding: "1.1rem 1.5rem",
    minHeight: "115px",
  };

  const smallLabel: React.CSSProperties = {
    fontSize: "0.8rem",
    fontWeight: 500,
    color: "#6b7280",
    marginBottom: "0.4rem",
  };

  const bigWeek: React.CSSProperties = {
    fontSize: "2.1rem",
    fontWeight: 700,
    letterSpacing: "0.02em",
    color: "#111827",
  };

  const subtleText: React.CSSProperties = {
    marginTop: "0.4rem",
    fontSize: "0.8rem",
    color: "#6b7280",
  };

  const headerRow: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "0.6rem",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "#111827",
  };

  const subtitleStyle: React.CSSProperties = {
    marginTop: "0.1rem",
    fontSize: "0.8rem",
    color: "#6b7280",
  };

  const weekLabel: React.CSSProperties = {
    fontSize: "0.75rem",
    padding: "0.2rem 0.6rem",
    borderRadius: "999px",
    backgroundColor: "#f3f4f6",
    color: "#374151",
  };

  const bigNumberBase: React.CSSProperties = {
    fontSize: "1.4rem",
    fontWeight: 700,
    lineHeight: 1.1,
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
  };

  const bigNumberGood: React.CSSProperties = {
    ...bigNumberBase,
    color: "#16a34a",
  };

  const bigNumberBad: React.CSSProperties = {
    ...bigNumberBase,
    color: "#dc2626",
  };

  const pillBase: React.CSSProperties = {
    fontSize: "0.65rem",
    fontWeight: 600,
    padding: "0.18rem 0.7rem",
    borderRadius: "999px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  const pillGood: React.CSSProperties = {
    ...pillBase,
    backgroundColor: "rgba(22,163,74,0.08)",
    color: "#15803d",
  };

  const pillBad: React.CSSProperties = {
    ...pillBase,
    backgroundColor: "rgba(220,38,38,0.06)",
    color: "#b91c1c",
  };

  const lineText: React.CSSProperties = {
    marginTop: "0.35rem",
    fontSize: "0.8rem",
    color: "#4b5563",
  };

  const mutedLine: React.CSSProperties = {
    marginTop: "0.2rem",
    fontSize: "0.78rem",
    color: "#6b7280",
  };

  // no insights yet: show only current week card
  if (!insights) {
    return (
      <section style={containerStyle}>
        <div style={cardBase}>
          <div style={smallLabel}>Current Week</div>
          <div style={bigWeek}>{currentWeekNow}</div>
          <div style={subtleText}>Today&apos;s trading period</div>
        </div>
      </section>
    );
  }

  const { wkLabel, salesActual, salesBudget, salesVar, salesVarPct } =
    insights;

  const isAboveBudget = salesVar >= 0;
  const salesVarAbs = Math.abs(salesVar);

  return (
    <section style={containerStyle}>
      {/* Card 1: current week */}
      <div style={cardBase}>
        <div style={smallLabel}>Current Week</div>
        <div style={bigWeek}>{currentWeekNow}</div>
        <div style={subtleText}>Today&apos;s trading period</div>
      </div>

      {/* Card 2: last week – Sales only */}
      <div style={cardBase}>
        <div style={headerRow}>
          <div>
            <div style={titleStyle}>Last Week Results</div>
            <div style={subtitleStyle}>Sales vs Budget</div>
          </div>
          <div style={weekLabel}>{wkLabel}</div>
        </div>

        <div style={isAboveBudget ? bigNumberGood : bigNumberBad}>
          <span>
            {salesVar === 0
              ? "£0"
              : `${isAboveBudget ? "+" : "-"}${formatCurrency(
                  salesVarAbs
                )}`}
          </span>
          <span style={isAboveBudget ? pillGood : pillBad}>
            {isAboveBudget ? "Above budget" : "Below budget"}
          </span>
        </div>

        <div style={lineText}>
          {salesVarPct === 0
            ? "On budget"
            : `${percentText(Math.abs(salesVarPct))} ${
                salesVarPct > 0 ? "over" : "under"
              } budget`}
        </div>

        <div style={mutedLine}>
          Actual {formatCurrency(salesActual)} vs Budget{" "}
          {formatCurrency(salesBudget)}
        </div>
      </div>
    </section>
  );
}
