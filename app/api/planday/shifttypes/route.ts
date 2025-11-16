// app/api/planday/shifttypes/route.ts
import { NextResponse } from "next/server";
import { listShiftTypes } from "@/lib/planday";

export async function POST(req: Request) {
  try {
    const { departmentIds } = await req.json() as { departmentIds: string[] };
    if (!Array.isArray(departmentIds) || departmentIds.length === 0) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    const buckets = await Promise.all(
      [...new Set(departmentIds)].map((d) => listShiftTypes(d))
    );

    const all = buckets.flatMap((j: any) => Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : []);
    const map = new Map<number, { id: number; name: string }>();
    all.forEach((x: any) => {
      const id = Number(x.id ?? x.ID);
      const name = String(x.name ?? x.Name ?? "Unknown");
      if (!Number.isNaN(id)) map.set(id, { id, name });
    });

    return NextResponse.json({ items: [...map.values()] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load shift types" }, { status: 500 });
  }
}
