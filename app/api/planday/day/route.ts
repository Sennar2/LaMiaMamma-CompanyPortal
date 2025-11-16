import { NextResponse } from "next/server";
import { plandayFetch } from "@/lib/planday";

type ReqBody = {
  departmentIds: string[];
  date: string;                 // "YYYY-MM-DD"
  status?: string | string[];   // optional; default => ["Published","Open"]
};

const pad = (n: number) => String(n).padStart(2, "0");

// add 1 day to YYYY-MM-DD → returns YYYY-MM-DD
const ymdPlusOne = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

// Generate full-day time ranges to try (different formats Planday accepts)
function buildCandidates(date: string) {
  const next = ymdPlusOne(date);
  return [
    { from: `${date}T00:00:00`, to: `${next}T00:00:00` }, // seconds
    { from: date,               to: next },               // date-only
    { from: `${date}T00:00`,    to: `${next}T00:00` },    // minutes
  ];
}

// Fallback: split the day into 2 half ranges (handles DST weirdness)
function buildHalfDayCandidates(date: string) {
  const next = ymdPlusOne(date);
  return [
    { from: `${date}T00:00:00`, to: `${date}T12:00:00` },
    { from: `${date}T12:00:00`, to: `${next}T00:00:00` },
  ];
}

/* ─────────────────────────────────────────
   Paging helpers for Shifts
────────────────────────────────────────── */
async function fetchShiftsPage(depId: string, qp: Record<string, string>) {
  const qs = new URLSearchParams({ departmentId: depId, ...qp });
  const data = await plandayFetch<any>(`/scheduling/v1.0/shifts?${qs.toString()}`);
  const list = Array.isArray(data) ? data : (data.items ?? data.data ?? []);
  return list.map((s: any) => ({ ...s, _deptId: depId }));
}

async function fetchShiftsAllPages(depId: string, base: Record<string, string>) {
  const patterns = [
    { kind: "limit/offset",  make: (i: number) => ({ ...base, limit: "200", offset: String(i * 200) }) },
    { kind: "page/pageSize", make: (i: number) => ({ ...base, pageSize: "200", page: String(i + 1) }) },
    { kind: "top/skip",      make: (i: number) => ({ ...base, top: "200",  skip: String(i * 200) }) },
    { kind: "take/skip",     make: (i: number) => ({ ...base, take: "200", skip: String(i * 200) }) },
  ];

  for (const p of patterns) {
    const out: any[] = [];
    try {
      for (let i = 0; i < 200; i++) {
        const page = await fetchShiftsPage(depId, p.make(i));
        out.push(...page);
        if (page.length < 200) break;
      }
      return out;
    } catch (e: any) {
      // try next pattern only for 400s (invalid params), otherwise rethrow
      if (!/Planday API 400/i.test(String(e?.message || e))) throw e;
    }
  }
  // fallback: single request
  return fetchShiftsPage(depId, base);
}

/* ─────────────────────────────────────────
   Shift Types (robust — tries multiple endpoints)
────────────────────────────────────────── */
async function fetchShiftTypesForDept(depId: string) {
  const attempts = [
    (qs: URLSearchParams) => `/scheduling/v1.0/shifttypes?${qs.toString()}`,
    (qs: URLSearchParams) => `/scheduling/v1.0/shiftTypes?${qs.toString()}`,
    (qs: URLSearchParams) => `/schedule/v1.0/shifttypes?${qs.toString()}`,
    (qs: URLSearchParams) => `/schedule/v1.0/shiftTypes?${qs.toString()}`,
  ];
  const qs = new URLSearchParams({ departmentId: depId, isActive: "true", offset: "0" });

  for (const mk of attempts) {
    try {
      const j = await plandayFetch<any>(mk(qs));
      const arr = Array.isArray(j) ? j : (j.items ?? j.data ?? []);
      if (Array.isArray(arr) && arr.length) return arr;
    } catch (e: any) {
      // ignore and try the next shape
      if (/Planday API 401|403/.test(String(e?.message || e))) throw e; // auth issue: bail
    }
  }
  return [];
}

async function buildShiftTypeMap(departmentIds: string[]) {
  const typeById = new Map<number, string>();
  try {
    const lists = await Promise.all(
      departmentIds.map((depId) => fetchShiftTypesForDept(depId))
    );
    for (const t of lists.flat()) {
      const id = Number(t.id ?? t.ID);
      const name = String(t.name ?? t.Name ?? "Unknown");
      if (!Number.isNaN(id)) typeById.set(id, name);
    }
  } catch {
    // swallow — no shift types available / scope missing
  }
  return typeById;
}

/* ─────────────────────────────────────────
   Employee Groups (robust — tries multiple endpoints)  OPTIONAL (hr:read)
────────────────────────────────────────── */
async function fetchEmployeeGroupsForDept(depId: string) {
  const attempts = [
    (qs: URLSearchParams) => `/hr/v1.0/employeegroups?${qs.toString()}`,
    (qs: URLSearchParams) => `/hr/v1/EmployeeGroups?${qs.toString()}`,
  ];
  const qs = new URLSearchParams({ departmentId: depId, offset: "0" });

  for (const mk of attempts) {
    try {
      const j = await plandayFetch<any>(mk(qs));
      const arr = Array.isArray(j) ? j : (j.items ?? j.data ?? []);
      if (Array.isArray(arr)) return arr;
    } catch (e: any) {
      // continue
      if (/Planday API 401|403/.test(String(e?.message || e))) throw e; // auth issue: bail
    }
  }
  return [];
}

async function buildEmployeeGroupMap(departmentIds: string[]) {
  const groupById = new Map<number, string>();
  try {
    const lists = await Promise.all(
      departmentIds.map((depId) => fetchEmployeeGroupsForDept(depId))
    );
    for (const g of lists.flat()) {
      const id = Number(g.id ?? g.ID);
      const name = String(g.name ?? g.Name ?? "Group");
      if (!Number.isNaN(id)) groupById.set(id, name);
    }
  } catch {
    // swallow — no hr:read or not exposed
  }
  return groupById;
}

/* ─────────────────────────────────────────
   Employee details (names + groupId)  OPTIONAL (hr:read)
────────────────────────────────────────── */
type EmpDetails = { name?: string; groupId?: number };
async function resolveEmployeeDetails(ids: string[]): Promise<Record<string, EmpDetails>> {
  const out: Record<string, EmpDetails> = {};
  if (!ids.length) return out;

  // Batch first
  try {
    const batch = await plandayFetch<any>(`/hr/v1/Employees?ids=${ids.join(",")}`);
    const arr = Array.isArray(batch) ? batch : (batch.items ?? batch.data ?? []);
    if (Array.isArray(arr)) {
      for (const e of arr) {
        const id = String(e.id ?? e.ID ?? "");
        const name = [e.firstName ?? e.FirstName, e.lastName ?? e.LastName]
          .filter(Boolean)
          .join(" ")
          .trim();
        const groupRaw =
          e.employeeGroupId ??
          e.primaryEmployeeGroupId ??
          e.defaultEmployeeGroupId ??
          e.EmployeeGroupId ??
          e.PrimaryEmployeeGroupId ??
          e.DefaultEmployeeGroupId;
        const groupId = Number(groupRaw);
        out[id] = {
          name: name || undefined,
          groupId: Number.isNaN(groupId) ? undefined : groupId,
        };
      }
    }
  } catch {
    // ignore batch failure, fallback to per-id
  }

  // Per-id fallback for anything missing
  const missing = ids.filter((id) => !out[id]);
  if (!missing.length) return out;

  const limit = 6; // mild concurrency
  let i = 0;

  await Promise.all(
    Array.from({ length: limit }).map(async () => {
      while (i < missing.length) {
        const idx = i++;
        const id = missing[idx];
        try {
          const e = await plandayFetch<any>(`/hr/v1/Employees/${id}`);
          const name = [e.firstName ?? e.FirstName, e.lastName ?? e.LastName]
            .filter(Boolean)
            .join(" ")
            .trim();
          const groupRaw =
            e.employeeGroupId ??
            e.primaryEmployeeGroupId ??
            e.defaultEmployeeGroupId ??
            e.EmployeeGroupId ??
            e.PrimaryEmployeeGroupId ??
            e.DefaultEmployeeGroupId;
          const groupId = Number(groupRaw);
          out[id] = {
            name: name || `Employee #${id}`,
            groupId: Number.isNaN(groupId) ? undefined : groupId,
          };
        } catch {
          out[id] = { name: `Employee #${id}` };
        }
      }
    })
  );

  return out;
}

/* ─────────────────────────────────────────
   normalize() → final shape to frontend
────────────────────────────────────────── */
function normalize(
  shifts: any[],
  emp: Record<string, EmpDetails>,
  groupById: Map<number, string>,
  typeById: Map<number, string>
) {
  const seen = new Set<string>();
  const out: any[] = [];

  for (const s of shifts) {
    const id = String(s.id ?? "");
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);

    const startISO = s.startDateTime ?? s.startUtc ?? s.start ?? s.startTime ?? null;
    const endISO   = s.endDateTime   ?? s.endUtc   ?? s.end   ?? s.endTime   ?? null;

    const empIdStr = s.employeeId != null ? String(s.employeeId) : null;

    const plandayGivenName: string | undefined = s.employeeName;
    const hrResolved = empIdStr ? emp[empIdStr] : undefined;
    const hrResolvedName: string | undefined = hrResolved?.name;

    let finalName = "Open shift";
    if (hrResolvedName && hrResolvedName.trim().length > 0) {
      finalName = hrResolvedName.trim();
    } else if (
      plandayGivenName &&
      plandayGivenName.trim().length > 0 &&
      !/^Employee\s*#\d+$/i.test(plandayGivenName.trim())
    ) {
      finalName = plandayGivenName.trim();
    } else if (empIdStr) {
      finalName = `Employee #${empIdStr}`;
    }

    // shift type
    const shiftTypeId = Number(s.shiftTypeId ?? s.ShiftTypeId ?? NaN);
    const shiftTypeName = Number.isNaN(shiftTypeId) ? undefined : (typeById.get(shiftTypeId) || undefined);

    // employment group (prefer from shift, else from employee)
    const groupFromShift = Number(s.employeeGroupId ?? s.EmployeeGroupId ?? NaN);
    const groupId =
      (!Number.isNaN(groupFromShift) && groupFromShift) ||
      (hrResolved?.groupId ?? undefined);
    const employeeGroupName = groupId ? (groupById.get(groupId) || undefined) : undefined;

    out.push({
      id,
      name: finalName,
      startISO,
      endISO,
      departmentId: s._deptId,
      shiftTypeId: Number.isNaN(shiftTypeId) ? undefined : shiftTypeId,
      shiftTypeName,
      employeeGroupId: groupId,
      employeeGroupName,
    });
  }

  return out.sort((a, b) =>
    String(a.startISO ?? "").localeCompare(String(b.startISO ?? ""))
  );
}

/* ─────────────────────────────────────────
   Route handler
────────────────────────────────────────── */
export async function POST(req: Request) {
  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { departmentIds, date } = body || {};
  const statusIn = body?.status;
  const statuses = Array.isArray(statusIn)
    ? statusIn
    : statusIn
    ? [statusIn]
    : ["Published", "Open"]; // include real + open shifts

  if (!departmentIds?.length || !date) {
    return NextResponse.json(
      { error: "departmentIds[] and date are required" },
      { status: 400 }
    );
  }

  try {
    // 1) Try whole-day ranges (several accepted formats)
    for (const c of buildCandidates(date)) {
      try {
        const all: any[] = [];

        for (const depId of departmentIds) {
          for (const st of statuses) {
            const base: Record<string, string> = { from: c.from, to: c.to, status: st };
            const items = await fetchShiftsAllPages(String(depId), base);
            all.push(...items);
          }
        }

        // Build enrichment maps (fail-soft)
        const empIds = Array.from(new Set(all.map((s: any) => s.employeeId).filter(Boolean))).map(String);
        const [typeById, groupById, empDetails] = await Promise.all([
          buildShiftTypeMap(departmentIds),
          buildEmployeeGroupMap(departmentIds).catch(() => new Map<number, string>()), // optional
          resolveEmployeeDetails(empIds).catch(() => ({})),                             // optional
        ]);

        return NextResponse.json(
          { items: normalize(all, empDetails, groupById, typeById) },
          { status: 200 }
        );
      } catch (e: any) {
        if (!/Planday API 400/i.test(String(e?.message || e))) {
          return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
        }
        // else: try next candidate format
      }
    }

    // 2) Fallback: split-day windows (DST safety)
    const halves = buildHalfDayCandidates(date);
    const all: any[] = [];

    for (const h of halves) {
      for (const depId of departmentIds) {
        for (const st of statuses) {
          const base: Record<string, string> = { from: h.from, to: h.to, status: st };
          const items = await fetchShiftsAllPages(String(depId), base);
          all.push(...items);
        }
      }
    }

    const empIds = Array.from(new Set(all.map((s: any) => s.employeeId).filter(Boolean))).map(String);
    const [typeById, groupById, empDetails] = await Promise.all([
      buildShiftTypeMap(departmentIds),
      buildEmployeeGroupMap(departmentIds).catch(() => new Map<number, string>()),
      resolveEmployeeDetails(empIds).catch(() => ({})),
    ]);

    return NextResponse.json(
      { items: normalize(all, empDetails, groupById, typeById) },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 502 });
  }
}
