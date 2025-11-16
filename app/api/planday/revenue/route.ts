import { NextResponse } from "next/server";
import { plandayFetch } from "@/lib/planday";

type ReqBody = { departmentIds: string[]; date: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ymdPlusDays = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

// Monday (ISO) in Europe/London
function weekStartMonday(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const wdStr = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(dt);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const wd = map[wdStr] || 1;
  const start = new Date(dt);
  start.setUTCDate(start.getUTCDate() - (wd - 1));
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(start).reduce((o: any, p) => (p.type !== "literal" ? ((o[p.type] = p.value), o) : o), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toLondonYmd(input: string | Date) {
  const dt = typeof input === "string" ? new Date(input) : input;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(dt).reduce((o: any, p) => (p.type !== "literal" ? ((o[p.type] = p.value), o) : o), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/* ── Revenue (actuals) at department level */
async function fetchDeptRevenueRows(depId: string, from: string, to: string) {
  const rows: Array<{ date: string; value: number }> = [];
  let offset = 0;
  const limit = 50;
  while (true) {
    const qs = new URLSearchParams({
      departmentId: depId, from, to,
      offset: String(offset), limit: String(limit)
    });
    const j = await plandayFetch<any>(`/revenue/v1.0/revenue?${qs}`);
    const arr = Array.isArray(j) ? j : (j.data ?? j.items ?? []);
    if (!Array.isArray(arr) || arr.length === 0) break;

    for (const r of arr) {
      const rawDate = r.date ?? r.businessDate ?? r.day ?? r.dateTime ?? r.dateUtc ?? "";
      const date = rawDate ? toLondonYmd(rawDate) : undefined;
      const v =
        typeof r.turnover === "number" ? r.turnover :
        typeof r.value === "number" ? r.value :
        typeof r.amount === "number" ? r.amount :
        Number(r.turnover ?? r.value ?? r.amount ?? 0);
      if (date) rows.push({ date, value: Number.isFinite(v) ? v : 0 });
    }
    if (arr.length < limit) break;
    offset += limit;
  }
  return rows;
}

/* ── Budgets (forecast) for departments */
async function fetchBudgetsRows(depIds: string[], from: string, to: string) {
  const qs = new URLSearchParams({ from, to });
  for (const id of depIds) qs.append("departmentIds", String(id));

  try {
    const j = await plandayFetch<any>(`/revenue/v1.0/budgets?${qs}`);
    const arr = Array.isArray(j) ? j : (j.data ?? j.items ?? []);
    if (!Array.isArray(arr)) return [];
    return arr.map((r: any) => {
      const rawDate = r.date ?? r.businessDate ?? r.day ?? r.dateTime ?? r.dateUtc ?? "";
      const date = rawDate ? toLondonYmd(rawDate) : undefined;
      const v =
        typeof r.budget === "number" ? r.budget :
        typeof r.turnoverBudget === "number" ? r.turnoverBudget :
        typeof r.value === "number" ? r.value :
        typeof r.amount === "number" ? r.amount :
        Number(r.budget ?? r.turnoverBudget ?? r.value ?? r.amount ?? 0);
      return { date, value: Number.isFinite(v) ? v : 0 };
    });
  } catch (e: any) {
    // if a tenant doesn’t have budgets enabled yet, just return empty
    return [];
  }
}

/* ── 120s in-memory cache */
type CacheVal = { expires: number; value: any };
const cache = new Map<string, CacheVal>();
const keyOf = (o: any) => JSON.stringify(o);

export async function POST(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  let body: ReqBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { departmentIds, date } = body || {};
  if (!Array.isArray(departmentIds) || !departmentIds.length || !date) {
    return NextResponse.json({ error: "departmentIds[] and date are required" }, { status: 400 });
  }

  const cacheKey = keyOf({ departmentIds: [...departmentIds].sort(), date, debug });
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > now) return NextResponse.json(hit.value, { status: 200 });

  try {
    const weekStart = weekStartMonday(date);
    const tomorrow  = ymdPlusDays(date, 1);

    // ACTUALS
    let todayActual = 0;
    let weekActual  = 0;
    for (const depId of departmentIds) {
      const rows = await fetchDeptRevenueRows(depId, weekStart, tomorrow);
      for (const r of rows) {
        if (r.date === date) todayActual += r.value;
        if (r.date >= weekStart && r.date <= date) weekActual += r.value;
      }
    }

    // BUDGETS / FORECASTS
    const budgetRows = await fetchBudgetsRows(departmentIds, weekStart, tomorrow);
    let todayBudget = 0;
    let weekBudget  = 0;
    for (const r of budgetRows) {
      if (!r.date) continue;
      if (r.date === date) todayBudget += r.value;
      if (r.date >= weekStart && r.date <= date) weekBudget += r.value;
    }

    const value = {
      todayActual,
      weekActual,
      todayBudget,   // NEW
      weekBudget,    // NEW
      weekForecast: weekBudget, // keep legacy name too (UI uses it)
      meta: { used: "planday" },
      ...(debug ? { debug: { budgetRowsSample: budgetRows.slice(0, 5) } } : {}),
    };
    cache.set(cacheKey, { expires: now + 120_000, value });
    return NextResponse.json(value, { status: 200 });
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (/Planday API 401|Planday API 403/i.test(msg)) {
      return NextResponse.json(
        { error: "Planday revenue authorization failed", detail: msg },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: "Revenue fetch failed", detail: msg }, { status: 502 });
  }
}
