// app/api/planday/employeegroups/route.ts
import { NextResponse } from "next/server";
import { listEmployeeGroups } from "@/lib/planday";

export async function POST(req: Request) {
  try {
    const { departmentIds } = await req.json() as { departmentIds?: string[] };
    const ids = Array.isArray(departmentIds) && departmentIds.length ? [...new Set(departmentIds)] : [undefined];

    const buckets = await Promise.all(ids.map((d) => listEmployeeGroups(d)));
    const all = buckets.flatMap((j: any) => Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : []);

    const map = new Map<number, { id: number; name: string }>();
    all.forEach((g: any) => {
      const id = Number(g.id ?? g.ID);
      const name = String(g.name ?? g.Name ?? "Group");
      if (!Number.isNaN(id)) map.set(id, { id, name });
    });

    return NextResponse.json({ items: [...map.values()] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load employee groups" }, { status: 500 });
  }
}
