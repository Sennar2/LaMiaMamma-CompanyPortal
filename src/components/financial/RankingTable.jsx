"use client";

import React from "react";

export default function RankingTable({
  rankingWeekData,
  rankingPeriodData,
  rankingView,
  setRankingView,
  payrollTarget,
  foodTarget,
  drinkTarget,
}) {
  const rankingData =
    rankingView === "period" ? rankingPeriodData : rankingWeekData;

  if (!rankingData || rankingData.length === 0) return null;

  function colorFor(val, target, inverse = false) {
    // inverse=false => good if val <= target
    // inverse=true  => good if val >= target
    const ok = inverse ? val >= target : val <= target;
    return {
      color: ok ? "#059669" : "#dc2626",
    };
  }

  const title =
    rankingView === "period"
      ? "Site Ranking (last period)"
      : "Site Ranking (last week)";

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
        {/* Header row with title + toggle + subtitle */}
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
              Sorted by highest Payroll %
            </div>
          </div>

          {/* toggle sits inside the card now */}
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
        </div>

        {/* Table */}
        <div
          style={{
            width: "100%",
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8rem",
              lineHeight: 1.4,
              minWidth: "600px",
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
                <th
                  style={{
                    padding: "0.5rem 0.75rem",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  Location
                </th>
                <th
                  style={{
                    padding: "0.5rem 0.75rem",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  Payroll %
                  <span
                    style={{
                      fontWeight: 400,
                      color: "#9ca3af",
                    }}
                  >
                    {' '}
                    (≤ {payrollTarget}%)
                  </span>
                </th>
                <th
                  style={{
                    padding: "0.5rem 0.75rem",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  Food %
                  <span
                    style={{
                      fontWeight: 400,
                      color: "#9ca3af",
                    }}
                  >
                    {' '}
                    (≤ {foodTarget}%)
                  </span>
                </th>
                <th
                  style={{
                    padding: "0.5rem 0.75rem",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  Drink %
                  <span
                    style={{
                      fontWeight: 400,
                      color: "#9ca3af",
                    }}
                  >
                    {' '}
                    (≤ {drinkTarget}%)
                  </span>
                </th>
                <th
                  style={{
                    padding: "0.5rem 0.75rem",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  Sales vs Budget
                </th>
              </tr>
            </thead>

            <tbody>
              {rankingData.map((row, idx) => {
                const payrollStyle = colorFor(row.payrollPct, payrollTarget);
                const foodStyle = colorFor(row.foodPct, foodTarget);
                const drinkStyle = colorFor(row.drinkPct, drinkTarget);
                const salesStyle = colorFor(row.salesVar, 0, true); // ≥0 is good

                return (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: "1px solid #e5e7eb",
                      backgroundColor:
                        idx === 0
                          ? "rgba(220,38,38,0.03)"
                          : "transparent",
                    }}
                  >
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
                        {row.week || '-'}
                      </div>
                    </td>

                    <td
                      style={{
                        padding: "0.75rem",
                        fontWeight: 600,
                        color: payrollStyle.color,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.payrollPct.toFixed(1)}%
                    </td>

                    <td
                      style={{
                        padding: "0.75rem",
                        fontWeight: 600,
                        color: foodStyle.color,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.foodPct.toFixed(1)}%
                    </td>

                    <td
                      style={{
                        padding: "0.75rem",
                        fontWeight: 600,
                        color: drinkStyle.color,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.drinkPct.toFixed(1)}%
                    </td>

                    <td
                      style={{
                        padding: "0.75rem",
                        fontWeight: 600,
                        color: salesStyle.color,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.salesVar >= 0 ? '+' : ''}
                      £{Math.round(row.salesVar).toLocaleString()}
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
          Worst payroll % appears first. Red = off target.
        </div>
      </div>
    </div>
  );
}
