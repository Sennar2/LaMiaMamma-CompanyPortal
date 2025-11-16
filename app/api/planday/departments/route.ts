// app/api/planday/departments/route.ts
import { NextResponse } from "next/server";
import { plandayFetch } from "@/lib/planday";

export async function GET() {
  try {
    const items: any[] = [];
    let offset = 0;
    for (let i = 0; i < 20; i++) {
      const q = new URLSearchParams({ offset: String(offset) });
      const j = await plandayFetch<any>(`/schedule/v1.0/departments?${q.toString()}`);
      const arr = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
      if (!arr.length) break;
      items.push(...arr);
      offset += arr.length;
      if (arr.length < 50) break;
    }
    const cleaned = items.map((d: any) => ({
      id: Number(d.id ?? d.ID),
      name: String(d.name ?? d.Name ?? "Dept"),
      parentId: d.parentId ?? d.ParentId ?? null,
      isActive: Boolean(d.isActive ?? d.IsActive ?? true),
    }));
    return NextResponse.json({ count: cleaned.length, items: cleaned }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to list departments" }, { status: 500 });
  }
}
