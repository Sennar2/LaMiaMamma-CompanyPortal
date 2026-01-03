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
  periodView, // 👈 NEW: "Week" | "Period" | "Quarter"
}) {
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
    return Number(value).toFixed(1) + "%";
  };

  const safeNum = (v) =>
    v == null || isNaN(Number(v)) ? 0 : Number(v);

  // ----------------- % CALCULATIONS -----------------

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
        out.Food_vsTheoPct =
          theo > 0 ? ((actual - theo) / theo) * 100 : 0;
      } else if (tab === "Drink") {
        const actual = safeNum(row.Drink_Actual);
        const theo = safeNum(row.Drink_Theo);
        out.Drink_vsTheoPct =
          theo > 0 ? ((actual - theo) / theo) * 100 : 0;
      }

      return out;
    });
  };

  const displayData =
    unit === "currency"
      ? filteredData
      : toPercentData(filteredData, activeTab);

  // ----------------- LINES -----------------

  let lines;
  if (unit === "percent" && activeTab === "Sales") {
    lines = [
      {
        key: "Sales_vsBudgetPct",
        color: "#4ade80",
        name: "Actual vs Budget",
      },
      {
        key: "Sales_vsLastYearPct",
        color: "#f97316",
        name: "Actual vs Last Year",
      },
    ];
  } else if (unit === "percent" && activeTab === "Payroll") {
    lines = [
      {
        key: "Payroll_vsTheoPct",
        color: "#4ade80",
        name: "Actual vs Theo",
      },
    ];
  } else if (unit === "percent" && activeTab === "Food") {
    lines = [
      {
        key: "Food_vsTheoPct",
        color: "#4ade80",
        name: "Actual vs Theo",
      },
    ];
  } else if (unit === "percent" && activeTab === "Drink") {
    lines = [
      {
        key: "Drink_vsTheoPct",
        color: "#4ade80",
        name: "Actual vs Theo",
      },
    ];
  } else {
    lines = baseLines;
  }

  const yTickFormatter = (value) =>
    unit === "currency" ? formatCurrency(value) : formatPercent(value);

  const tooltipFormatter = (value, name) => [
    unit === "currency" ? formatCurrency(value) : formatPercent(value),
    name,
  ];

  // ----------------- X AXIS KEY (THE FIX) -----------------

  const xAxisKey =
    periodView === "Period"
      ? "Period"
      : periodView === "Quarter"
      ? "Quarter"
      : "Week";

  // --------------------------------------------------

  return (
    <div
      style={{
        maxWidth: "1400px",
        margin: "0 auto 2rem auto",
        backgroundColor: "#fff",
        borderRadius: "0.75rem",
        boxShadow:
          "0 24px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
        border: "1px solid rgba(0,0,0,0.05)",
        padding: "1rem 1rem 1.5rem",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          rowGap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
            {activeTab}: Actual vs Budget
          </h2>

          {/* £ / % toggle */}
          <div
            style={{
              display: "inline-flex",
              borderRadius: "999px",
              border: "1px solid rgba(0,0,0,0.08)",
              backgroundColor: "#f9fafb",
              padding: "0.15rem",
            }}
          >
            {["currency", "percent"].map((m) => (
              <button
                key={m}
                onClick={() => setUnit(m)}
                style={{
                  padding: "0.25rem 0.6rem",
                  borderRadius: "999px",
                  border: "none",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  backgroundColor: unit === m ? "#111827" : "transparent",
                  color: unit === m ? "#fff" : "#4b5563",
                }}
              >
                {m === "currency" ? "£" : "%"}
              </button>
            ))}
          </div>
        </div>

        <CSVLink
          data={displayData}
          filename={`${activeTab}-${periodView}.csv`}
          style={{
            fontSize: "0.8rem",
            backgroundColor: "#111827",
            color: "#fff",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          Export CSV
        </CSVLink>
      </div>

      {/* CHART */}
      <div style={{ width: "100%", height: "300px" }}>
        <ResponsiveContainer>
          <LineChart data={displayData}>
            <XAxis dataKey={xAxisKey} />
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
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
