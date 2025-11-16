// app/api/planday/unit-revenues/route.ts
import { NextResponse } from "next/server";
import { listUnitRevenues } from "@/lib/planday";

export async function POST(req: Request) {
  try {
    const { unitId, from, to } = (await req.json()) as {
      unitId: number | string;
      from: string; // YYYY-MM-DD
      to: string;   // YYYY-MM-DD
    };
    if (!unitId || !from || !to) {
      return NextResponse.json({ error: "unitId, from, to required" }, { status: 400 });
    }
    const json = await listUnitRevenues(unitId, from, to);
    return NextResponse.json(json, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to fetch unit revenues" }, { status: 500 });
  }
}
