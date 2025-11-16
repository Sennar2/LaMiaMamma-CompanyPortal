// app/api/_debug/env/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    has_CLIENT_ID: !!process.env.PLANDAY_CLIENT_ID,
    has_REFRESH_TOKEN: !!process.env.PLANDAY_REFRESH_TOKEN,
    has_CLIENT_SECRET: !!process.env.PLANDAY_CLIENT_SECRET,
    TOKEN_URL: process.env.PLANDAY_TOKEN_URL || "(default) https://id.planday.com/connect/token",
    API_BASE: process.env.PLANDAY_BASE_URL || "(default) https://openapi.planday.com",
    NODE_ENV: process.env.NODE_ENV,
  });
}

