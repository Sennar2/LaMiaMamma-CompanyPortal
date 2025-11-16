// app/api/planday/revenueunits/route.ts
import { NextResponse } from "next/server";
import { plandayFetch } from "@/lib/planday";

export async function POST(req: Request) {
  try {
    const { departmentIds } = (await req.json()) as { departmentIds?: string[] };

    let units: Array<{ id: number; name: string; departmentId?: number }> = [];
    if (Array.isArray(departmentIds) && departmentIds.length) {
      const lists = await Promise.all(
        [...new Set(departmentIds)].map(async (dept) => {
          try {
            const q = new URLSearchParams({ departmentId: String(dept) });
            const j = await plandayFetch<any>(`/revenue/v1.0/revenueunits?${q.toString()}`);
            const arr = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
            return arr.map((u: any) => ({
              id: Number(u.id ?? u.ID),
              name: String(u.name ?? u.Name ?? "Unit"),
              departmentId: Number(u.departmentId ?? u.DepartmentId ?? dept),
            }));
          } catch {
            return [];
          }
        })
      );
      units = lists.flat();
    } else {
      // fall back to all units visible by the token
      const j = await plandayFetch<any>(`/revenue/v1.0/revenueunits`);
      const arr = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
      units = arr.map((u: any) => ({
        id: Number(u.id ?? u.ID),
        name: String(u.name ?? u.Name ?? "Unit"),
        departmentId: Number(u.departmentId ?? u.DepartmentId ?? NaN),
      }));
    }

    return NextResponse.json({ count: units.length, units }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to list units" }, { status: 500 });
  }
}
