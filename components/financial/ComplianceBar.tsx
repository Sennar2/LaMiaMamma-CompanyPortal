"use client";

import React from "react";

type ComplianceInsights = {
  wkLabel: string;
  payrollPct: number;
  foodPct: number;
  drinkPct: number;
  salesVsLastYearPct: number;
  avgPayrollVar4w: number; // rolling average of Payroll_v% last 4 weeks
  // optional, used to compute £ lines if available
  salesActual?: number;
} | null;

type ComplianceBarProps = {
  insights: ComplianceInsights;
};

const PAYROLL_TARGET = 35; // ≤ 35%
const FOOD_TARGET = 12.5; // ≤ 12.5%
const DRINK_TARGET = 5.5; // ≤ 5.5%
const LY_TARGET = 0; // ≥ 0%

// Traffic-light colour for avgPayrollVar4w
// Rule (signed):
//   avg ≤ +1%        -> green
//   +1% < avg ≤ +2%  -> amber
//   avg > +2%        -> red
//   (negative = under target = green)
function getTrendColor(avg: number | undefined | null) {
  if (avg === undefined || avg === null || Number.isNaN(avg)) {
    return "bg-gray-400";
  }
  if (avg <= 1) return "bg-green-500";
  if (avg <= 2) return "bg-yellow-400";
  return "bg-red-500";
}

function formatCurrency(val: number | undefined | null) {
  if (val == null || Number.isNaN(val)) return "£0";
  const abs = Math.abs(Number(val));
  return (
    "£" +
    abs.toLocaleString("en-GB", {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    })
  );
}

// Cost line e.g. "Cost: ≈ £4,187 on £147,078 sales"
function buildCostLine(
  pct: number | undefined | null,
  salesActual: number | undefined
): string {
  if (!salesActual || salesActual === 0) {
    return "Cost: no sales data";
  }
  if (pct == null || Number.isNaN(pct)) {
    return "Cost: no cost data";
  }
  const amount = (salesActual * pct) / 100;
  return `Cost: ≈ ${formatCurrency(amount)} on ${formatCurrency(
    salesActual
  )} sales`;
}

// Sales vs LY £ line, using salesActual + % vs LY
function buildSalesVsLyLine(
  pct: number | undefined | null,
  salesActual: number | undefined
): string {
  if (!salesActual || salesActual === 0) return "No LY data";
  if (pct == null || Number.isNaN(pct)) return "No LY data";

  const ratio = 1 + pct / 100; // pct = (A - LY)/LY *100
  if (ratio === 0) return "No LY data";

  const ly = salesActual / ratio;
  const diff = salesActual - ly;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${formatCurrency(diff)} vs LY`;
}

// Reusable stat card
function StatCard({
  title,
  valuePct,
  ok,
  targetText,
  weekLabel,
  labelOk,
  labelNotOk,
  costLine,
  extraLine,
  showTrendDot,
  trendColor,
  trendLabel,
}: {
  title: string;
  valuePct: number;
  ok: boolean;
  targetText: string;
  weekLabel: string;
  labelOk: string;
  labelNotOk: string;
  costLine?: string;
  extraLine?: string;
  showTrendDot?: boolean;
  trendColor?: string;
  trendLabel?: string;
}) {
  const displayPct = Number.isNaN(valuePct) ? 0 : valuePct;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col min-w-[220px] gap-1.5">
      {/* Header line */}
      <div className="flex items-center justify-between text-[11px] leading-tight">
        <div className="text-gray-900 font-semibold text-[13px]">
          {title}
        </div>

        <div className="flex items-center gap-2 text-gray-500">
          {showTrendDot && trendColor ? (
            <span
              className={`inline-block w-3 h-3 rounded-full ${trendColor} border border-white shadow-[0_0_3px_rgba(0,0,0,0.4)]`}
              title="4-week payroll trend"
            />
          ) : null}

          <span className="px-2 py-0.5 rounded-full bg-gray-50 text-[10px] font-medium text-gray-700">
            {weekLabel || "—"}
          </span>
        </div>
      </div>

      {/* Main value row */}
      <div
        className={`mt-2 flex items-center gap-2 text-xl font-bold ${
          ok ? "text-emerald-600" : "text-red-600"
        }`}
      >
        <span>{displayPct.toFixed(1)}%</span>
        <span
          className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 font-semibold ${
            ok
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {ok ? labelOk : labelNotOk}
        </span>
      </div>

      {/* Target line */}
      <div className="text-[11px] text-gray-600 mt-0.5">
        {targetText}
      </div>

      {/* Cost / extra lines */}
      {costLine && (
        <div className="text-[11px] text-gray-600 mt-0.5">
          {costLine}
        </div>
      )}
      {extraLine && (
        <div className="text-[11px] text-gray-500 mt-0.5">
          {extraLine}
        </div>
      )}

      {/* Optional trend line (for payroll) */}
      {showTrendDot && trendLabel && (
        <div className="flex items-center gap-2 text-[11px] text-gray-600 mt-1">
          <span
            className={`inline-block w-2 h-2 rounded-full ${trendColor}`}
          />
          <span>{trendLabel}</span>
        </div>
      )}
    </div>
  );
}

export default function ComplianceBar({ insights }: ComplianceBarProps) {
  if (!insights) return null;

  const payrollOk = insights.payrollPct <= PAYROLL_TARGET;
  const foodOk = insights.foodPct <= FOOD_TARGET;
  const drinkOk = insights.drinkPct <= DRINK_TARGET;
  const lyOk = insights.salesVsLastYearPct >= LY_TARGET;

  const trendColor = getTrendColor(insights.avgPayrollVar4w);
  const avgVar = insights.avgPayrollVar4w ?? 0;

  let trendLabel = "No 4-week data";
  if (!Number.isNaN(avgVar)) {
    if (avgVar === 0) {
      trendLabel = "4-week avg exactly on target";
    } else if (avgVar > 0) {
      trendLabel = `${avgVar.toFixed(
        1
      )} pts over target (4-week avg)`;
    } else {
      trendLabel = `${Math.abs(avgVar).toFixed(
        1
      )} pts under target (4-week avg)`;
    }
  }

  const salesActual = insights.salesActual;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* Payroll % with trend dot + £ line */}
      <StatCard
        title="Payroll %"
        valuePct={insights.payrollPct || 0}
        ok={payrollOk}
        targetText={`Target ≤ ${PAYROLL_TARGET}%`}
        weekLabel={insights.wkLabel || "—"}
        labelOk="On target"
        labelNotOk="Off target"
        costLine={buildCostLine(insights.payrollPct, salesActual)}
        showTrendDot
        trendColor={trendColor}
        trendLabel={trendLabel}
      />

      {/* Food % with £ line */}
      <StatCard
        title="Food %"
        valuePct={insights.foodPct || 0}
        ok={foodOk}
        targetText={`Target ≤ ${FOOD_TARGET}%`}
        weekLabel={insights.wkLabel || "—"}
        labelOk="On target"
        labelNotOk="Off target"
        costLine={buildCostLine(insights.foodPct, salesActual)}
      />

      {/* Drink % with £ line */}
      <StatCard
        title="Drink %"
        valuePct={insights.drinkPct || 0}
        ok={drinkOk}
        targetText={`Target ≤ ${DRINK_TARGET}%`}
        weekLabel={insights.wkLabel || "—"}
        labelOk="On target"
        labelNotOk="Off target"
        costLine={buildCostLine(insights.drinkPct, salesActual)}
      />

      {/* Sales vs LY with £ diff line */}
      <StatCard
        title="Sales vs LY"
        valuePct={insights.salesVsLastYearPct || 0}
        ok={lyOk}
        targetText={`Target ≥ ${LY_TARGET}%`}
        weekLabel={insights.wkLabel || "—"}
        labelOk="On target"
        labelNotOk="Below LY"
        extraLine={buildSalesVsLyLine(
          insights.salesVsLastYearPct,
          salesActual
        )}
      />
    </div>
  );
}
