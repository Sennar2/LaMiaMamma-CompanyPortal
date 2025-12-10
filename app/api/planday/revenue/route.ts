import { NextResponse } from "next/server";
import { LOCATIONS } from "@/data/locations";

/** ---------- Config ---------- **/

// Published CSV (each tab is a location, columns include: WeekStart, Payroll_App, SaleForecast)
const WEEK_FORECAST_CSV_BASE =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSxZeFz50aJUNKILXl3GqdQW-_CCXO4-6aizsQbFMXjsL4q24iJV1zhWkEeT-wbjl4psDOT3mHdrO7U/pub?output=csv";

// If Planday doesn’t give a payroll target %, fall back per-site here
const PAYROLL_TARGET_FALLBACK: Record<string, number> = {
  "La Mia Mamma - Chelsea": 35,
  "La Mia Mamma - Hollywood Road": 34,
  "La Mia Mamma - Notting Hill": 35,
  "La Mia Mamma - Battersea": 34,
  "Made in Italy - Chelsea": 35,
  "Made in Italy - Battersea": 35,
  "Fish and Bubbles - Fulham": 45,
  "Fish and Bubbles - Notting Hill": 32,
};

/** ---------- Types ---------- **/
type Body = {
  departmentIds?: string[];
  // pass any date in the target week (yyyy-mm-dd). If omitted, uses "today".
  anchorYmd?: string;
  locationName?: string; // for target/fallback & sheet tab selection
};

/** ---------- Helpers ---------- **/
function startOfWeekMonday(ymd: string) {
  const d = new Date(ymd + "T00:00:00");
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  const delta = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + delta);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function addDays(ymd: string, days: number) {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function weekRangeFromAnchor(ymd: string) {
  const mon = startOfWeekMonday(ymd);
  const sun = addDays(mon, 6);
  return {
    start: `${mon}T00:00:00Z`,
    end: `${sun}T23:59:59.999Z`,
  };
}
function pickFirstNumber(obj: any, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (v == null) continue;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}
const NAME_BY_DEPT: Record<string, string> = (() => {
  const pairs: Array<[string, string]> = [];
  for (const loc of LOCATIONS as any[]) {
    if (loc?.plandayDepartmentId != null) {
      pairs.push([String(loc.plandayDepartmentId), String(loc.name)]);
    }
  }
  return Object.fromEntries(pairs);
})();
function inferSingleLocationName(deptIds: string[]): string | null {
  const names = new Set<string>();
  for (const id of deptIds) {
    const n = NAME_BY_DEPT[String(id)];
    if (n) names.add(n);
  }
  if (names.size === 1) return Array.from(names)[0];
  return null;
}

// tiny CSV parser (enough for our sheet)
function parseCSV(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  return lines.map((ln) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < ln.length; i++) {
      const ch = ln[i];
      if (ch === '"' && ln[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = !inQ;
      } else if (ch === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  });
}

/**
 * Read one week's forecast from the Google Sheet.
 * It matches on WeekStart column (UK dd/mm/yyyy OR yyyy-mm-dd) to the given weekMonYmd (yyyy-mm-dd).
 */
async function readWeeklyForecastFromSheet(
  tabName: string,
  weekMonYmd: string
): Promise<{ salesForecast?: number; payrollForecastGBP?: number }> {
  try {
    const url = `${WEEK_FORECAST_CSV_BASE}&sheet=${encodeURIComponent(tabName)}`;
    const resp = await fetch(url);
    if (!resp.ok) return {};
    const text = await resp.text();
    const rows = parseCSV(text);
    if (rows.length < 2) return {};

    const header = rows[0].map((h) => h.toLowerCase());

    const saleIdx = header.findIndex((h) => h.includes("saleforecast"));
    const payrollIdx = header.findIndex((h) => h.includes("payroll_app"));
    const weekIdx =
      header.findIndex((h) => h.includes("weekstart")) >= 0
        ? header.findIndex((h) => h.includes("weekstart"))
        : header.findIndex((h) => h === "week");

    if ((saleIdx === -1 && payrollIdx === -1) || weekIdx === -1) return {};

    // normalise "dd/mm/yyyy" (UK) or "yyyy-mm-dd" -> "yyyy-mm-dd"
    const normaliseWeekCell = (raw: string | undefined): string | null => {
      if (!raw) return null;
      const s = raw.trim();
      if (!s) return null;

      // already iso?
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

      // dd/mm/yyyy or dd-mm-yyyy
      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (m) {
        const [, d, mo, y] = m;
        const dd = d.padStart(2, "0");
        const mm = mo.padStart(2, "0");
        return `${y}-${mm}-${dd}`;
      }

      return null;
    };

    // 1) Exact match: row whose WeekStart equals this week's Monday
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const weekCell = normaliseWeekCell(r[weekIdx]);
      if (weekCell !== weekMonYmd) continue;

      const sale =
        saleIdx >= 0
          ? Number(String(r[saleIdx] || "").replace(/[,£]/g, ""))
          : NaN;
      const payr =
        payrollIdx >= 0
          ? Number(String(r[payrollIdx] || "").replace(/[,£]/g, ""))
          : NaN;

      const hasSale = Number.isFinite(sale) && sale > 0;
      const hasPayr = Number.isFinite(payr) && payr > 0;

      if (!hasSale && !hasPayr) continue;

      return {
        salesForecast: hasSale ? Math.round(sale) : undefined,
        payrollForecastGBP: hasPayr ? Math.round(payr) : undefined,
      };
    }

    // 2) Fallback: largest SaleForecast if no week match
    let bestRowIndex: number | null = null;
    let bestSale = -Infinity;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const sale =
        saleIdx >= 0
          ? Number(String(r[saleIdx] || "").replace(/[,£]/g, ""))
          : NaN;
      if (!Number.isFinite(sale) || sale <= 0) continue;
      if (sale > bestSale) {
        bestSale = sale;
        bestRowIndex = i;
      }
    }

    if (bestRowIndex == null) return {};

    const row = rows[bestRowIndex];
    const saleVal =
      saleIdx >= 0
        ? Number(String(row[saleIdx] || "").replace(/[,£]/g, ""))
        : NaN;
    const payVal =
      payrollIdx >= 0
        ? Number(String(row[payrollIdx] || "").replace(/[,£]/g, ""))
        : NaN;

    const hasSale = Number.isFinite(saleVal) && saleVal > 0;
    const hasPayr = Number.isFinite(payVal) && payVal > 0;

    return {
      salesForecast: hasSale ? Math.round(saleVal) : undefined,
      payrollForecastGBP: hasPayr ? Math.round(payVal) : undefined,
    };
  } catch {
    return {};
  }
}

/** ---------- Handler ---------- **/
export async function POST(req: Request) {
  try {
    const body: Body = await req.json();
    const { departmentIds, anchorYmd, locationName } = body || {};
    if (!departmentIds?.length) {
      return NextResponse.json({ error: "departmentIds required" }, { status: 400 });
    }

    const ymd = anchorYmd || new Date().toISOString().slice(0, 10);

    // Week boundaries in YMD
    const weekMonYmd = startOfWeekMonday(ymd);
    const weekSunYmd = addDays(weekMonYmd, 6);

    // Full week range (Mon–Sun)
    const weekStartISO = `${weekMonYmd}T00:00:00Z`;
    const weekEndISO = `${weekSunYmd}T23:59:59.999Z`;

    // "So far" range: Mon → yesterday (but not before Monday)
    const yesterdayYmd = addDays(ymd, -1);
    const uptoYmd = yesterdayYmd < weekMonYmd ? weekMonYmd : yesterdayYmd;
    const uptoEndISO = `${uptoYmd}T23:59:59.999Z`;

    const origin = new URL(req.url).origin;

    // 1) Labour/wages (scheduled)
    let wagesWeekGBP = 0; // full week scheduled
    let wagesToDateGBP = 0; // scheduled so far (Mon–yesterday)

    try {
      // full week
      const labourWeekResp = await fetch(`${origin}/api/planday/labour`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentIds, start: weekStartISO, end: weekEndISO }),
      });
      if (labourWeekResp.ok) {
        const j = await labourWeekResp.json();
        wagesWeekGBP = Number(j?.weekLabourScheduled ?? 0);
      }

      // so far
      const labourToDateResp = await fetch(`${origin}/api/planday/labour`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentIds, start: weekStartISO, end: uptoEndISO }),
      });
      if (labourToDateResp.ok) {
        const j2 = await labourToDateResp.json();
        wagesToDateGBP = Number(j2?.weekLabourScheduled ?? 0);
      }
    } catch {
      // leave wages* at 0 on failure
    }

    // 2) Sales actual + Planday forecast + target % (if available)
    let salesActual = 0; // actual Mon–yesterday
    let salesForecast = 0; // full week forecast
    let plandayTargetPct: number | null = null;

    try {
      const revResp = await fetch(`${origin}/api/planday/revenue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentIds, date: ymd }),
      });
      if (revResp.ok) {
        const j = await revResp.json();
        salesActual = Number(j?.weekActual ?? 0); // Mon–yesterday
        salesForecast = Number(j?.weekForecast ?? j?.weekBudgetFull ?? 0);

        const possibleTarget = pickFirstNumber(
          j,
          "payrollTargetPct",
          "labourBudgetPct",
          "weekPayrollTargetPct",
          "labourTargetPct"
        );
        if (possibleTarget != null) plandayTargetPct = possibleTarget;
      }
    } catch {
      // ignore, keep zeros
    }

    // 3) Sheet forecast: WeekStart + Payroll_App + SaleForecast
    const resolvedLocation =
      locationName || inferSingleLocationName(departmentIds) || undefined;

    let payrollForecastGBP: number | null = null;

    if (resolvedLocation) {
      const f = await readWeeklyForecastFromSheet(resolvedLocation, weekMonYmd);
      if (f.salesForecast != null && (!salesForecast || salesForecast === 0)) {
        salesForecast = f.salesForecast;
      }
      if (f.payrollForecastGBP != null) {
        payrollForecastGBP = f.payrollForecastGBP;
      }
    }

    // 4) Target % resolution: Planday > site fallback
    let targetPct: number | null = null;
    let targetSource: "planday" | "fallback" | "none" = "none";
    if (plandayTargetPct != null) {
      targetPct = plandayTargetPct;
      targetSource = "planday";
    } else if (resolvedLocation && PAYROLL_TARGET_FALLBACK[resolvedLocation] != null) {
      targetPct = PAYROLL_TARGET_FALLBACK[resolvedLocation];
      targetSource = "fallback";
    }

    // 5) Derived percentages
    const payrollPctActual =
      salesActual > 0 ? (wagesToDateGBP / salesActual) * 100 : null;

    const payrollPctForecast =
      salesForecast > 0 && payrollForecastGBP != null
        ? (payrollForecastGBP / salesForecast) * 100
        : salesForecast > 0
        ? (wagesWeekGBP / salesForecast) * 100
        : null;

    const variancePct =
      payrollPctActual != null && targetPct != null
        ? Number((payrollPctActual - targetPct).toFixed(2))
        : null;

    const varianceGBP =
      variancePct != null && salesActual > 0
        ? Math.round((variancePct / 100) * salesActual)
        : null;

    const { start, end } = weekRangeFromAnchor(ymd);

    return NextResponse.json({
      scope: {
        start,
        end,
        anchorYmd: ymd,
        locationResolved: resolvedLocation,
      },
      totals: {
        // BACKWARDS COMPAT: wagesGBP = "wages so far"
        wagesGBP: Number(wagesToDateGBP.toFixed(2)),

        wagesToDateGBP: Number(wagesToDateGBP.toFixed(2)), // Mon–yesterday
        wagesWeekGBP: Number(wagesWeekGBP.toFixed(2)), // Mon–Sun full week
        payrollForecastGBP:
          payrollForecastGBP != null
            ? Number(payrollForecastGBP.toFixed(2))
            : null,

        salesActual: Math.round(salesActual),
        salesForecast: Math.round(salesForecast),

        payrollPctActual:
          payrollPctActual != null ? Number(payrollPctActual.toFixed(2)) : null,
        payrollPctForecast:
          payrollPctForecast != null ? Number(payrollPctForecast.toFixed(2)) : null,
        targetPct,
        variancePct,
        varianceGBP,
      },
      sources: {
        wages: "planday:labour(scheduled, mon-sun + so-far)",
        sales:
          "planday:revenue (week). SaleForecast from sheet if Planday budgets missing",
        target: targetSource,
        forecastsSheet: resolvedLocation ? `sheet tab = ${resolvedLocation}` : "n/a",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
