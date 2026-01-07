"use client";

import { useEffect, useState } from "react";

const PAYROLL_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQc6Ug8ESK-1bHrGCpJhzA5yLjuEz1lukbbFItcm8WkXFXmeUDXkxPN4hB17ZubV4CUrCk_EyTYx2Yq/pub?output=csv";

// Sheet columns:
// A = Working Period Start (DD/MM/YYYY)
// B = Working Period End   (DD/MM/YYYY)
// C = Pay Date             (DD/MM/YYYY)

function parseDateFromCell(v: string): Date | null {
  const value = v.trim();
  if (!value) return null;

  // native parse first
  const native = new Date(value);
  if (!Number.isNaN(native.getTime())) return native;

  // DD/MM/YYYY
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d));
  }

  return null;
}

type NextPayroll = {
  startDate: Date;
  endDate: Date;
  payDate: Date;
  startRaw: string;
  endRaw: string;
  payRaw: string;
};

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = date.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "In 1 day";
  if (diffDays > 1) return `In ${diffDays} days`;
  if (diffDays === -1) return "1 day ago";
  return `${Math.abs(diffDays)} days ago`;
}

async function fetchNextPayroll(): Promise<NextPayroll | null> {
  const res = await fetch(PAYROLL_CSV_URL);
  if (!res.ok) {
    console.error("Failed to fetch payroll CSV", res.status);
    return null;
  }

  const csv = await res.text();
  const lines = csv.trim().split("\n");
  if (lines.length <= 1) return null;

  const [headerLine, ...dataLines] = lines;

  // safety check: we expect "Working Period Start,Working Period,Pay Date"
  // but we still just use first 3 columns.
  console.log("Payroll header:", headerLine);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming: NextPayroll[] = [];

  for (const line of dataLines) {
    if (!line.trim()) continue;

    const [startCell = "", endCell = "", payCell = ""] = line.split(",");

    if (!payCell.trim()) continue;

    const startDate = parseDateFromCell(startCell);
    const endDate = parseDateFromCell(endCell);
    const payDate = parseDateFromCell(payCell);

    if (!startDate || !endDate || !payDate) continue;

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    payDate.setHours(0, 0, 0, 0);

    if (payDate >= today) {
      upcoming.push({
        startDate,
        endDate,
        payDate,
        startRaw: startCell.trim(),
        endRaw: endCell.trim(),
        payRaw: payCell.trim(),
      });
    }
  }

  if (!upcoming.length) return null;

  upcoming.sort((a, b) => Number(a.payDate) - Number(b.payDate));
  return upcoming[0];
}

export default function PayrollCard() {
  const [next, setNext] = useState<NextPayroll | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await fetchNextPayroll();
        if (!cancelled) {
          setNext(result);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Could not load payroll info");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-white p-4 rounded-xl shadow hover:shadow-lg text-center">
      <h3 className="text-sm font-semibold text-gray-700">Payroll</h3>

      {loading && (
        <p className="text-xs text-gray-400 mt-2">Loading payroll…</p>
      )}

      {!loading && error && (
        <p className="text-xs text-red-500 mt-2">{error}</p>
      )}

      {!loading && !error && !next && (
        <p className="text-xs text-gray-400 mt-2">
          No upcoming payroll found in the sheet.
        </p>
      )}

      {!loading && !error && next && (
        <div className="mt-2 space-y-1">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-500">
              Next pay date
            </p>
            <p className="text-xl font-extrabold text-gray-900">
              {formatDisplayDate(next.payDate)}
            </p>
            <p className="text-xs text-gray-500">
              {daysUntil(next.payDate)} • ({next.payRaw})
            </p>
          </div>

          <div className="mt-3 text-xs text-gray-600">
            <p className="font-medium">Working period</p>
            <p>
              {next.startRaw} → {next.endRaw}
            </p>
          </div>

          <p className="mt-2 text-[10px] text-gray-400">
            Data from Payroll Google Sheet
          </p>
        </div>
      )}
    </div>
  );
}
