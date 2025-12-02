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
}) {
  // base line config coming from the parent
  const baseLines = chartConfig[activeTab] || [];

  // "currency" (£) or "percent" (%)
  const [unit, setUnit] = React.useState("currency");

  // ----------------- HELPERS -----------------

  const formatCurrency = (value) => {
    if (value == null || isNaN(Number(value))) return "";
    return (
      "£" +
      Number(value).toLocaleString("en-GB", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    );
  };

  const formatPercent = (value) => {
    if (value == null || isNaN(Number(value))) return "";
    const pct = Number(value); // can be positive or negative
    return pct.toFixed(1) + "%";
  };

  const safeNum = (v) =>
    v == null || isNaN(Number(v)) ? 0 : Number(v);

  /**
   * Build a copy of filteredData where:
   * - Sales (percent mode):
   *    Sales_vsBudgetPct    = (Actual - Budget) / Budget * 100
   *    Sales_vsLastYearPct  = (Actual - LastYear) / LastYear * 100
   *
   * - Payroll / Food / Drink (percent mode):
   *    Actual, Budget = value / Theo * 100
   *    Theo           = 100
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

        // We leave Sales_Actual / Sales_Budget / Sales_LastYear
        // untouched here; we just don't use them in % mode.
      } else if (tab === "Payroll") {
        const theo = safeNum(row.Payroll_Theo);
        if (theo > 0) {
          out.Payroll_Actual =
            (safeNum(row.Payroll_Actual) / theo) * 100;
          out.Payroll_Budget =
            (safeNum(row.Payroll_Budget) / theo) * 100;
          out.Payroll_Theo = 100;
        } else {
          out.Payroll_Actual = 0;
          out.Payroll_Budget = 0;
          out.Payroll_Theo = 0;
        }
      } else if (tab === "Food") {
        const theo = safeNum(row.Food_Theo);
        if (theo > 0) {
          out.Food_Actual = (safeNum(row.Food_Actual) / theo) * 100;
          out.Food_Budget =
            (safeNum(row.Food_Budget) / theo) * 100;
          out.Food_Theo = 100;
        } else {
          out.Food_Actual = 0;
          out.Food_Budget = 0;
          out.Food_Theo = 0;
        }
      } else if (tab === "Drink") {
        const theo = safeNum(row.Drink_Theo);
        if (theo > 0) {
          out.Drink_Actual =
            (safeNum(row.Drink_Actual) / theo) * 100;
          out.Drink_Budget =
            (safeNum(row.Drink_Budget) / theo) * 100;
          out.Drink_Theo = 100;
        } else {
          out.Drink_Actual = 0;
          out.Drink_Budget = 0;
          out.Drink_Theo = 0;
        }
      }

      return out;
    });
  };

  // Data actually fed into the chart, depending on unit
  const displayData =
    unit === "currency"
      ? filteredData
      : toPercentData(filteredData, activeTab);

  // In % mode for Sales we use special lines based on the diff fields
  let lines;
  if (unit === "percent" && activeTab === "Sales") {
    const salesActualLine =
      baseLines.find((l) => l.key === "Sales_Actual") ||
      baseLines[0] ||
      { color: "#4ade80" };

    const lastYearLine =
      baseLines.find((l) => l.key === "Sales_LastYear") ||
      baseLines[2] ||
      { color: "#f97316" };

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
  } else {
    // default: reuse parent config (Sales in £, Payroll/Food/Drink in £ or % vs Theo)
    lines = baseLines;
  }

  const yTickFormatter = (value) =>
    unit === "currency" ? formatCurrency(value) : formatPercent(value);

  const tooltipFormatter = (value, name) => {
    const formatted =
      unit === "currency" ? formatCurrency(value) : formatPercent(value);
    return [formatted, name];
  };

  // --------------------------------------------------

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
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
                backgroundColor:
                  unit === "currency" ? "#111827" : "transparent",
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
                backgroundColor:
                  unit === "percent" ? "#111827" : "transparent",
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
          data={filteredData}
          filename={`${activeTab}.csv`}
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
            <XAxis dataKey="Week" />
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
