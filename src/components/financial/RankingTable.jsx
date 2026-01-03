"use client";

import React from "react";
import { CSVLink } from "react-csv";

export default function RankingTable({
  rankingWeekData,
  rankingPeriodData,
  rankingView,
  setRankingView,
  weekOptions,
  selectedWeek,
  onWeekChange,
  periodOptions,
  selectedPeriod,
  onPeriodChange,
  payrollTarget,
  foodTarget,
  drinkTarget,
  onRowClick = undefined,
}) {
  const rankingData =
    rankingView === "period" ? rankingPeriodData : rankingWeekData;

  if (!rankingData || rankingData.length === 0) return null;

  // local toggle: show only % or % + £
  const [valueView, setValueView] = React.useState("both"); // "percent" | "both"

  const rowsClickable = typeof onRowClick === "function";

  const activeLabel = rankingView === "period" ? selectedPeriod : selectedWeek;

  const title =
    rankingView === "period"
      ? `Site Ranking – ${activeLabel || "Period"}`
      : `Site Ranking – ${activeLabel || "Week"}`;

  const subtitle =
    rankingView === "period"
      ? "Showing selected period. Sorted by highest Payroll % (worst at the top)."
      : "Showing selected week. Sorted by highest Payroll % (worst at the top).";

  // ---------- styling helpers ----------
  function colorForPayroll(pct, target) {
    if (pct == null || isNaN(pct)) return { color: "#6b7280" };
    const diff = pct - target;
    if (diff <= 1) return { color: "#059669" }; // green
    if (diff <= 2) return { color: "#f59e0b" }; // amber
    return { color: "#dc2626" }; // red
  }

  function colorForThreshold(val, target) {
    if (val == null || isNaN(val)) return { color: "#6b7280" };
    return { color: val <= target ? "#059669" : "#dc2626" };
  }

  function colorForSalesVar(val) {
    if (val == null || isNaN(val)) return { color: "#6b7280" };
    return { color: val >= 0 ? "#059669" : "#dc2626" };
  }

  // ---------- formatters ----------
  function fmtGBP(val) {
    if (val == null || isNaN(val)) return "£–";
    const abs = Math.round(Math.abs(Number(val)));
    return "£" + abs.toLocaleString("en-GB");
  }

  function fmtSalesVarMoney(val) {
    if (val == null || isNaN(val)) return "£0";
    const sign = val >= 0 ? "+" : "−";
    const abs = Math.round(Math.abs(val));
    return `${sign}£${abs.toLocaleString("en-GB")}`;
  }

  function fmtPct(val) {
    if (val == null || isNaN(val)) return "–";
    return `${val.toFixed(1)}%`;
  }

  function fmtSignedPct(val) {
    if (val == null || isNaN(val)) return "–";
    const sign = val >= 0 ? "+" : "";
    return `${sign}${val.toFixed(1)}%`;
  }

  // ---------- Sales_Actual extractor (Column B) ----------
  function getSalesActual(row) {
    const v =
      row?.Sales_Actual ??
      row?.["Sales_Actual"] ??
      row?.sales_actual ??
      row?.salesActual ??
      row?.salesValue ??
      row?.sales;

    const n = Number(
      typeof v === "string" ? v.replace(/[^\d.-]/g, "") : v
    );
    return Number.isFinite(n) ? n : null;
  }

  function getBudget(row) {
    const v =
      row?.Sales_Budget ??
      row?.["Sales_Budget"] ??
      row?.sales_budget ??
      row?.salesBudget ??
      row?.budgetValue ??
      row?.budget;

    const n = Number(
      typeof v === "string" ? v.replace(/[^\d.-]/g, "") : v
    );
    return Number.isFinite(n) ? n : null;
  }

  // ---------- CSV export ----------
  const csvFilename = `site-ranking-${rankingView}-${activeLabel || "selected"}.csv`;

  const csvData = rankingData.map((r) => {
    const salesActual = getSalesActual(r);
    const salesBudget = getBudget(r);

    return {
      Location: r.location ?? "",
      Period: r.week ?? "",
      Sales_Actual: salesActual ?? "",
      Sales_Budget: salesBudget ?? "",
      Sales_Variance: r.salesVar ?? "",
      Sales_VariancePct: r.salesVarPct ?? "",
      Payroll_Pct: r.payrollPct ?? "",
      Payroll_Cost: r.payrollValue ?? "",
      Food_Pct: r.foodPct ?? "",
      Food_Cost: r.foodValue ?? "",
      Drink_Pct: r.drinkPct ?? "",
      Drink_Cost: r.drinkValue ?? "",
    };
  });

  // ---------- PDF export (print-to-PDF) ----------
  const tableRef = React.useRef(null);

  function handleExportPDF() {
    const html = tableRef.current?.outerHTML;
    if (!html) return;

    const w = window.open("", "_blank");
    if (!w) return;

    w.document.open();
    w.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <meta charset="utf-8" />
          <style>
            body { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { font-size: 18px; margin: 0 0 6px 0; }
            .sub { font-size: 12px; color: #6b7280; margin: 0 0 18px 0; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
            th { color: #6b7280; font-weight: 600; }
            @media print {
              body { padding: 0; }
              button { display: none !important; }
            }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <p class="sub">${subtitle}</p>
          ${html}
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    w.document.close();
  }

  // ---------- render ----------
  return (
    <div
      style={{
        maxWidth: "1400px",
        margin: "0 auto 1.5rem auto",
        padding: "0 1rem",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "0.75rem",
          border: "1px solid rgba(0,0,0,0.05)",
          boxShadow:
            "0 24px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
          padding: "1rem 1rem 1.25rem",
        }}
      >
        {/* Header row */}
        <div
          style={{
            marginBottom: "0.75rem",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            rowGap: "0.5rem",
            alignItems: "center",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "1rem",
                fontWeight: 600,
                color: "#111827",
                lineHeight: 1.3,
              }}
            >
              {title}
            </h2>
            <div
              style={{
                fontSize: "0.7rem",
                color: "#6b7280",
                lineHeight: 1.3,
                marginTop: "0.15rem",
              }}
            >
              {subtitle}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            {/* Export buttons */}
            <CSVLink
              data={csvData}
              filename={csvFilename}
              style={{
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "999px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Export CSV
              </span>
            </CSVLink>

            <button
              type="button"
              onClick={handleExportPDF}
              style={{
                padding: "0.35rem 0.75rem",
                borderRadius: "999px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
                color: "#111827",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Export PDF
            </button>

            {/* View: % only / % + £ */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                fontSize: "0.7rem",
                color: "#6b7280",
              }}
            >
              <span>View</span>
              <div
                style={{
                  display: "inline-flex",
                  borderRadius: "999px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#f9fafb",
                  padding: "2px",
                  gap: "2px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setValueView("percent")}
                  style={{
                    padding: "0.15rem 0.6rem",
                    borderRadius: "999px",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 500,
                    fontSize: "0.7rem",
                    backgroundColor:
                      valueView === "percent" ? "#111827" : "transparent",
                    color: valueView === "percent" ? "#fff" : "#4b5563",
                    boxShadow:
                      valueView === "percent"
                        ? "0 4px 8px rgba(0,0,0,0.25)"
                        : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  % only
                </button>
                <button
                  type="button"
                  onClick={() => setValueView("both")}
                  style={{
                    padding: "0.15rem 0.6rem",
                    borderRadius: "999px",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 500,
                    fontSize: "0.7rem",
                    backgroundColor:
                      valueView === "both" ? "#111827" : "transparent",
                    color: valueView === "both" ? "#fff" : "#4b5563",
                    boxShadow:
                      valueView === "both"
                        ? "0 4px 8px rgba(0,0,0,0.25)"
                        : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  % + £
                </button>
              </div>
            </div>

            {/* week/period toggle */}
            <div
              style={{
                display: "inline-flex",
                borderRadius: "999px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#f9fafb",
                padding: "2px",
                gap: "2px",
                fontSize: "0.75rem",
              }}
            >
              <button
                type="button"
                onClick={() => setRankingView("week")}
                style={{
                  padding: "0.25rem 0.7rem",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 500,
                  backgroundColor:
                    rankingView === "week" ? "#111827" : "transparent",
                  color: rankingView === "week" ? "#fff" : "#4b5563",
                  boxShadow:
                    rankingView === "week"
                      ? "0 6px 12px rgba(0,0,0,0.25)"
                      : "none",
                  transition: "all 0.15s ease",
                }}
              >
                Last week
              </button>
              <button
                type="button"
                onClick={() => setRankingView("period")}
                style={{
                  padding: "0.25rem 0.7rem",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 500,
                  backgroundColor:
                    rankingView === "period" ? "#111827" : "transparent",
                  color: rankingView === "period" ? "#fff" : "#4b5563",
                  boxShadow:
                    rankingView === "period"
                      ? "0 6px 12px rgba(0,0,0,0.25)"
                      : "none",
                  transition: "all 0.15s ease",
                }}
              >
                Last period
              </button>
            </div>

            {/* week / period picker */}
            {rankingView === "week" && weekOptions?.length > 0 && (
              <select
                value={selectedWeek}
                onChange={(e) => onWeekChange(e.target.value)}
                style={{
                  borderRadius: "999px",
                  border: "1px solid #e5e7eb",
                  padding: "0.25rem 0.7rem",
                  fontSize: "0.75rem",
                  backgroundColor: "#ffffff",
                  color: "#374151",
                  outline: "none",
                }}
              >
                {weekOptions.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            )}

            {rankingView === "period" && periodOptions?.length > 0 && (
              <select
                value={selectedPeriod}
                onChange={(e) => onPeriodChange(e.target.value)}
                style={{
                  borderRadius: "999px",
                  border: "1px solid #e5e7eb",
                  padding: "0.25rem 0.7rem",
                  fontSize: "0.75rem",
                  backgroundColor: "#ffffff",
                  color: "#374151",
                  outline: "none",
                }}
              >
                {periodOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Table */}
        <div style={{ width: "100%", overflowX: "auto" }}>
          <table
            ref={tableRef}
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8rem",
              lineHeight: 1.4,
              minWidth: "900px",
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  color: "#6b7280",
                  fontWeight: 500,
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <th style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                  Location
                </th>

                {/* Sales Actual column */}
                <th style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                  Sales (£)
                </th>

                <th style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                  Payroll{" "}
                  <span style={{ fontWeight: 400, color: "#9ca3af" }}>
                    (Target {payrollTarget}%)
                  </span>
                </th>

                <th style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                  Food{" "}
                  <span style={{ fontWeight: 400, color: "#9ca3af" }}>
                    (≤ {foodTarget}%)
                  </span>
                </th>

                <th style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                  Drink{" "}
                  <span style={{ fontWeight: 400, color: "#9ca3af" }}>
                    (≤ {drinkTarget}%)
                  </span>
                </th>

                <th style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                  Sales vs Budget
                </th>
              </tr>
            </thead>

            <tbody>
              {rankingData.map((row, idx) => {
                const payrollStyle = colorForPayroll(
                  row.payrollPct,
                  payrollTarget
                );
                const foodStyle = colorForThreshold(row.foodPct, foodTarget);
                const drinkStyle = colorForThreshold(row.drinkPct, drinkTarget);
                const salesStyle = colorForSalesVar(row.salesVar);

                const salesActual = getSalesActual(row);
                const salesBudget = getBudget(row);

                return (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: "1px solid #e5e7eb",
                      backgroundColor:
                        idx === 0 ? "rgba(220,38,38,0.03)" : "transparent",
                      cursor: rowsClickable ? "pointer" : "default",
                    }}
                    onClick={
                      rowsClickable
                        ? () => onRowClick(row.location)
                        : undefined
                    }
                  >
                    {/* Location */}
                    <td
                      style={{
                        padding: "0.75rem",
                        fontWeight: 500,
                        color: "#111827",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.location}
                      <div
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 400,
                          color: "#9ca3af",
                          lineHeight: 1.3,
                        }}
                      >
                        {row.week || "-"}
                      </div>
                    </td>

                    {/* Sales */}
                    <td
                      style={{
                        padding: "0.75rem",
                        fontWeight: 700,
                        color: "#111827",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <div>{fmtGBP(salesActual)}</div>
                      {valueView === "both" && salesBudget != null && (
                        <div
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 400,
                            color: "#6b7280",
                            marginTop: "0.15rem",
                          }}
                        >
                          Budget {fmtGBP(salesBudget)}
                        </div>
                      )}
                    </td>

                    {/* Payroll */}
                    <td
                      style={{
                        padding: "0.75rem",
                        fontWeight: 600,
                        color: payrollStyle.color,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <div>{fmtPct(row.payrollPct)}</div>
                      {valueView === "both" && (
                        <div
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 400,
                            color: "#6b7280",
                          }}
                        >
                          {fmtGBP(row.payrollValue)} payroll cost
                        </div>
                      )}
                    </td>

                    {/* Food */}
                    <td
                      style={{
                        padding: "0.75rem",
                        fontWeight: 600,
                        color: foodStyle.color,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <div>{fmtPct(row.foodPct)}</div>
                      {valueView === "both" && (
                        <div
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 400,
                            color: "#6b7280",
                          }}
                        >
                          {fmtGBP(row.foodValue)} food cost
                        </div>
                      )}
                    </td>

                    {/* Drink */}
                    <td
                      style={{
                        padding: "0.75rem",
                        fontWeight: 600,
                        color: drinkStyle.color,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <div>{fmtPct(row.drinkPct)}</div>
                      {valueView === "both" && (
                        <div
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 400,
                            color: "#6b7280",
                          }}
                        >
                          {fmtGBP(row.drinkValue)} drink cost
                        </div>
                      )}
                    </td>

                    {/* Sales vs Budget */}
                    <td
                      style={{
                        padding: "0.75rem",
                        fontWeight: 600,
                        color: salesStyle.color,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <div>{fmtSalesVarMoney(row.salesVar)}</div>
                      {valueView === "both" && (
                        <div
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 400,
                            color: "#6b7280",
                          }}
                        >
                          {fmtSignedPct(row.salesVarPct)} vs budget
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div
          style={{
            fontSize: "0.7rem",
            color: "#6b7280",
            lineHeight: 1.4,
            marginTop: "0.75rem",
          }}
        >
          Worst payroll % appears first. Payroll colour is based on how far the
          average % for that week/period is from the {payrollTarget}% target:
          green ≤ 1pt over, amber 1–2pts over, red &gt; 2pts over.
        </div>
      </div>
    </div>
  );
}
