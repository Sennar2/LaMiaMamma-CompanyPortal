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
  const lines = chartConfig[activeTab] || [];

  // "currency" (£) or "percent" (%)
  const [unit, setUnit] = React.useState("currency");

  // ----------------- FORMAT HELPERS -----------------

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

    // If your values are already 0–100:
    const pct = Number(value);

    // If they are 0–1, use instead:
    // const pct = Number(value) * 100;

    return pct.toFixed(1) + "%";
  };

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
          <LineChart data={filteredData}>
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
