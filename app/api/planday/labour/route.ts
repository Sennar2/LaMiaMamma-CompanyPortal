import { NextResponse } from "next/server";

type Body = {
  departmentIds?: string[];
  start?: string; // ISO "yyyy-mm-ddT00:00:00Z"
  end?: string;   // ISO "yyyy-mm-ddT23:59:59.999Z"
};

// Optional: per-department override for average hourly rate (GBP)
const HOURLY_RATE_BY_DEPT: Record<string, number> = {
  // "12345": 13.5,
};

// Fallback default hourly rate (GBP)
const DEFAULT_HOURLY_RATE = parseFloat(process.env.LABOUR_RATE_DEFAULT || "12.5");

function ymdFromISOStart(iso: string) {
  return iso.slice(0, 10); // "yyyy-mm-dd"
}
function addDays(ymd: string, days: number) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function listYmds(startIso: string, endIso: string) {
  const ys = ymdFromISOStart(startIso);
  const ye = ymdFromISOStart(endIso);
  const res: string[] = [];
  let cur = ys;
  while (cur <= ye) {
    res.push(cur);
    cur = addDays(cur, 1);
  }
  return res;
}

// Europe/London day key
function toLondonDateKey(iso: string) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [dd, mm, yyyy] = fmt.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

function rateForDept(deptId: string | null | undefined): number {
  if (!deptId) return DEFAULT_HOURLY_RATE;
  return HOURLY_RATE_BY_DEPT[deptId] ?? DEFAULT_HOURLY_RATE;
}

export async function POST(req: Request) {
  try {
    const body: Body = await req.json();
    const { departmentIds, start, end } = body || {};

    if (!departmentIds?.length) {
      return NextResponse.json({ error: "departmentIds required" }, { status: 400 });
    }
    if (!start || !end) {
      return NextResponse.json({ error: "start and end required (ISO)" }, { status: 400 });
    }

    const origin = new URL(req.url).origin;
    const ymds = listYmds(start, end);
    let scheduledCostTotal = 0;

    for (const ymd of ymds) {
      const resp = await fetch(`${origin}/api/planday/day`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentIds, date: ymd }),
      });

      if (!resp.ok) continue;

      const json = await resp.json();
      const items: any[] = Array.isArray(json.items) ? json.items : [];

      // ✅ Filter to *that exact London day* (the old code did not)
      const dayItems = items.filter((s) => s?.startISO && toLondonDateKey(s.startISO) === ymd);

      for (const s of dayItems) {
        const startISO = s.startISO ? new Date(s.startISO) : null;
        const endISO = s.endISO ? new Date(s.endISO) : null;
        if (!startISO || !endISO) continue;

        const ms = endISO.getTime() - startISO.getTime();
        if (ms <= 0) continue;

        const hours = ms / (1000 * 60 * 60);
        const deptId = s.departmentId != null ? String(s.departmentId) : null;
        const rate = rateForDept(deptId);

        scheduledCostTotal += hours * rate;
      }
    }

    return NextResponse.json({
      weekLabourScheduled: Number(scheduledCostTotal.toFixed(2)),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to compute labour" }, { status: 500 });
  }
}
