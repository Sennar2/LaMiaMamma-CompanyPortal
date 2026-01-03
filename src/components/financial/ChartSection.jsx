"use client";

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function ChartSection({
  activeTab,
  filteredData,
  chartConfig,
  CSVLink,
  periodView, // 👈 IMPORTANT: pass periodView={period} from FinancialPage
}) {
  const baseLines = chartConfig[activeTab] || [];

  // "currency" (£) or "percent" (%)
  const [unit, setUnit] = React.useState("currency");

  // ----------------- HELPERS -----------------

  const safeNum = (v) => (v == null || isNaN(Number(v)) ? 0 : Number(v));

  // Full money format for tooltip (e.g. £277,621)
  const formatCurrencyFull = (value) => {
    if (value == null || isNaN(Number(value))) return "";
    return (
      "£" +
      Number(value).toLocaleString("en-GB", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    );
  };

  // Y-axis money format in thousands (e.g. £278K)
  const formatCurrencyK = (value) => {
    if (value == null || isNaN(Number(value))) return "";
    const n = Number(value);
    const k = Math.round(n / 1000);
    return `£${k.toLocaleString("en-GB")}K`;
  };

  const formatPercent = (value) => {
    if (value == null || isNaN(Number(value))) return "";
    return Number(value).toFixed(1) + "%";
  };

  /**
   * Build a copy of filteredData where:
   *
   * Sales (percent mode):
   *   Sales_vsBudgetPct   = (Actual - Budget) / Budget * 100
   *   Sales_vsLastYearPct = (Actual - LastYear) / LastYear * 100
   *
   * Payroll / Food / Drink (percent mode):
   *   <Metric>_vsTheoPct  = (Actual - Theo) / Theo * 100
   */
  const toPercentData = (rows, tab) => {
    return rows.map((row) => {
      const out = { ...row };

      if (tab === "Sales") {
        const actual = safeNum(row.Sales_Actual);
        const budget = safeNum(row.Sales_Budget);
        const lastYear = safeNum(row.Sales_LastYear);

        out.Sales_vsBudgetPct =
          budget > 0 ? ((actual - budget) / budget) * 100 : 0;

        out.Sales_vsLastYearPct =
          lastYear > 0 ? ((actual - lastYear) / lastYear) * 100 : 0;
      } else if (tab === "Payroll") {
        const actual = safeNum(row.Payroll_Actual);
        const theo = safeNum(row.Payroll_Theo);
        out.Payroll_vsTheoPct =
          theo > 0 ? ((actual - theo) / theo) * 100 : 0;
      } else if (tab === "Food") {
        const actual = safeNum(row.Food_Actual);
        const theo = safeNum(row.Food_Theo);
        out.Food_vsTheoPct = theo > 0 ? ((actual - theo) / theo) * 100 : 0;
      } else if (tab === "Drink") {
        const actual = safeNum(row.Drink_Actual);
        const theo = safeNum(row.Drink_Theo);
        out.Drink_vsTheoPct =
          theo > 0 ? ((actual - theo) / theo) * 100 : 0;
      }

      return out;
    });
  };

  // Data actually fed into the chart, depending on unit
  const rawDisplayData =
    unit === "currency"
      ? filteredData
      : toPercentData(filteredData, activeTab);

  /**
   * ✅ LABEL FIX:
   * Week view → use Week (W35)
   * Period view → force P# (from row.Period OR extract from Week if needed)
   * Quarter view → force Q# (from row.Quarter OR extract from Week if needed)
   */
  const displayData = React.useMemo(() => {
    return (rawDisplayData || []).map((row) => {
      // Week: use week label
      if (periodView === "Week") {
        return { ...row, __xLabel: row?.Week ?? "" };
      }

      // Period: prefer Period else extract P#
      if (periodView === "Period") {
        const p =
          row?.Period ??
          (typeof row?.Week === "string" ? row.Week.match(/P\d+/)?.[0] : null);

        return { ...row, __xLabel: p ?? "" };
      }

      // Quarter: prefer Quarter else extract Q#
      const q =
        row?.Quarter ??
        (typeof row?.Week === "string" ? row.Week.match(/Q\d+/)?.[0] : null);

      return { ...row, __xLabel: q ?? "" };
    });
  }, [rawDisplayData, periodView]);

  // Choose which lines to render in % mode
  let lines;
  if (unit === "percent" && activeTab === "Sales") {
    const salesActualLine =
      baseLines.find((l) => l.key === "Sales_Actual") || baseLines[0] || {
        color: "#4ade80",
      };

    const lastYearLine =
      baseLines.find((l) => l.key === "Sales_LastYear") || baseLines[2] || {
        color: "#f97316",
      };

    lines = [
      {
        key: "Sales_vsBudgetPct",
        color: salesActualLine.color,
        name: "Actual vs Budget",
      },
      {
        key: "Sales_vsLastYearPct",
        color: lastYearLine.color,
        name: "Actual vs Last Year",
      },
    ];
  } else if (unit === "percent" && activeTab === "Payroll") {
    const actualLine =
      baseLines.find((l) => l.key === "Payroll_Actual") || baseLines[0] || {
        color: "#4ade80",
      };

    lines = [
      {
        key: "Payroll_vsTheoPct",
        color: actualLine.color,
        name: "Actual vs Theo",
      },
    ];
  } else if (unit === "percent" && activeTab === "Food") {
    const actualLine =
      baseLines.find((l) => l.key === "Food_Actual") || baseLines[0] || {
        color: "#4ade80",
      };

    lines = [
      {
        key: "Food_vsTheoPct",
        color: actualLine.color,
        name: "Actual vs Theo",
      },
    ];
  } else if (unit === "percent" && activeTab === "Drink") {
    const actualLine =
      baseLines.find((l) => l.key === "Drink_Actual") || baseLines[0] || {
        color: "#4ade80",
      };

    lines = [
      {
        key: "Drink_vsTheoPct",
        color: actualLine.color,
        name: "Actual vs Theo",
      },
    ];
  } else {
    // £ mode: use original lines (Actual, Budget, Theo, Last Year)
    lines = baseLines;
  }

  // ✅ Y axis formatting: show £K in currency, % in percent
  const yTickFormatter = (value) =>
    unit === "currency" ? formatCurrencyK(value) : formatPercent(value);

  // ✅ Tooltip formatting: full £, not £K
  const tooltipFormatter = (value, name) => {
    const formatted =
      unit === "currency" ? formatCurrencyFull(value) : formatPercent(value);
    return [formatted, name];
  };

  return (
    <div
      style={{
        maxWidth: "1400px",
        marginLeft: "auto",
        marginRight: "auto",
        backgroundColor: "#fff",
        borderRadius: "0.75rem",
        boxShadow:
          "0 24px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
        border: "1px solid rgba(0,0,0,0.05)",
        padding: "1rem 1rem 1.5rem",
        marginBottom: "2rem",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          rowGap: "0.75rem",
          columnGap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h2
            style={{
              margin: 0,
              fontSize: "1rem",
              fontWeight: 600,
              color: "#111827",
              lineHeight: 1.3,
            }}
          >
            {activeTab}: Actual vs Budget
          </h2>

          {/* £ / % toggle */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              padding: "0.15rem",
              borderRadius: "999px",
              border: "1px solid rgba(0,0,0,0.08)",
              backgroundColor: "#f9fafb",
            }}
          >
            <button
              type="button"
              onClick={() => setUnit("currency")}
              style={{
                padding: "0.25rem 0.6rem",
                borderRadius: "999px",
                border: "none",
                fontSize: "0.75rem",
                fontWeight: 500,
                cursor: "pointer",
                backgroundColor: unit === "currency" ? "#111827" : "transparent",
                color: unit === "currency" ? "#fff" : "#4b5563",
                boxShadow:
                  unit === "currency"
                    ? "0 6px 12px rgba(0,0,0,0.25)"
                    : "none",
                transition: "all 0.15s ease",
              }}
            >
              £
            </button>
            <button
              type="button"
              onClick={() => setUnit("percent")}
              style={{
                padding: "0.25rem 0.6rem",
                borderRadius: "999px",
                border: "none",
                fontSize: "0.75rem",
                fontWeight: 500,
                cursor: "pointer",
                backgroundColor: unit === "percent" ? "#111827" : "transparent",
                color: unit === "percent" ? "#fff" : "#4b5563",
                boxShadow:
                  unit === "percent"
                    ? "0 6px 12px rgba(0,0,0,0.25)"
                    : "none",
                transition: "all 0.15s ease",
              }}
            >
              %
            </button>
          </div>
        </div>

        <CSVLink
          data={displayData}
          filename={`${activeTab}-${periodView}-${unit}.csv`}
          style={{
            fontSize: "0.8rem",
            backgroundColor: "#111827",
            color: "#fff",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            textDecoration: "none",
            fontWeight: 500,
            lineHeight: 1.2,
            boxShadow: "0 12px 24px rgba(0,0,0,0.4)",
          }}
        >
          Export CSV
        </CSVLink>
      </div>

      <div style={{ width: "100%", height: "300px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={displayData}>
            {/* ✅ Always use clean computed label */}
            <XAxis dataKey="__xLabel" />
            <YAxis tickFormatter={yTickFormatter} />
            <Tooltip formatter={tooltipFormatter} />
            <Legend />
            {lines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                stroke={line.color}
                name={line.name}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: "#000" }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
