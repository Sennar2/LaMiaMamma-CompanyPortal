// app/api/planday/_debug/token/route.ts
import { NextResponse } from "next/server";
import { __debug_getAccessToken } from "@/lib/planday";

function decodePart(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const json = Buffer.from(b64 + pad, "base64").toString("utf8");
  try { return JSON.parse(json); } catch { return {}; }
}

export async function GET() {
  try {
    const token = await __debug_getAccessToken();
    const [, payloadB64] = token.split(".");
    const payload = decodePart(payloadB64 || "");
    const scopes =
      payload.scope || payload.scp || payload.Scopes || payload.scopes || "";
    const exp = payload.exp ? new Date(payload.exp * 1000).toISOString() : null;
    return NextResponse.json({ scopes, exp, payload }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "no token" }, { status: 500 });
  }
}
