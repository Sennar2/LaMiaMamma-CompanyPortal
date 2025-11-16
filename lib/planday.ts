// lib/planday.ts

const TOKEN_URL = "https://id.planday.com/connect/token";
const API_BASE = "https://openapi.planday.com";

type TokenCache = { accessToken: string; expiresAt: number } | null;
let tokenCache: TokenCache = null;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAccessToken(): Promise<{ access_token: string; expires_in: number }> {
  const clientId = process.env.PLANDAY_CLIENT_ID!;
  const refreshToken = process.env.PLANDAY_REFRESH_TOKEN!;
  if (!clientId || !refreshToken) {
    throw new Error("Missing PLANDAY_CLIENT_ID or PLANDAY_REFRESH_TOKEN");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Planday token exchange failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Use cached token if still valid (with 30s safety buffer)
  if (tokenCache && tokenCache.expiresAt - 30 > now) {
    return tokenCache.accessToken;
  }

  const { access_token, expires_in } = await fetchAccessToken();

  tokenCache = {
    accessToken: access_token,
    // Clamp expiry between 60s and 3600s as a safety margin
    expiresAt: now + Math.max(60, Math.min(expires_in, 3600)),
  };

  return tokenCache.accessToken;
}

async function doFetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3,
): Promise<Response> {
  let attempt = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastErr: any;

  while (attempt <= retries) {
    try {
      const res = await fetch(url, { ...init, cache: "no-store" });

      // If unauthorized, clear token cache and retry (once per attempt)
      if (res.status === 401 && attempt < retries) {
        tokenCache = null;
        await getAccessToken();
        attempt++;
        continue;
      }

      // Basic backoff for transient errors / rate limits
      if ([429, 502, 503].includes(res.status) && attempt < retries) {
        const backoff = 500 * Math.pow(2, attempt); // 500, 1000, 2000 ms
        await sleep(backoff);
        attempt++;
        continue;
      }

      return res;
    } catch (e) {
      lastErr = e;
      if (attempt >= retries) throw e;
      const backoff = 500 * Math.pow(2, attempt);
      await sleep(backoff);
      attempt++;
    }
  }

  throw lastErr ?? new Error("Network error");
}

export async function plandayFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const accessToken = await getAccessToken();

  const res = await doFetchWithRetry(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      "X-ClientId": process.env.PLANDAY_CLIENT_ID!,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Planday API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

/**
 * ---- Legacy helpers used by existing API routes ----
 *
 * These functions are used by:
 *   - app/api/planday/_debug/token/route.ts
 *   - app/api/planday/employeegroups/route.ts
 *   - app/api/planday/shifttypes/route.ts
 *   - app/api/planday/unit-revenues/route.ts
 */

// Used by app/api/planday/_debug/token/route.ts
export async function __debug_getAccessToken(): Promise<string> {
  // Just returns the raw access token; route file can decode / inspect it.
  return getAccessToken();
}

// Used by app/api/planday/employeegroups/route.ts
// Signature allows up to 3 args, but we only care about the first (departmentId).
export async function listEmployeeGroups(
  departmentId?: number | string,
  _from?: string,
  _to?: string,
): Promise<any> {
  const params = new URLSearchParams();
  if (departmentId !== undefined && departmentId !== null) {
    params.set("departmentIds", String(departmentId));
  }
  const query = params.toString();
  return plandayFetch<any>(`/api/hr/v1/employeeGroups${query ? `?${query}` : ""}`);
}

// Used by app/api/planday/shifttypes/route.ts
// Also allows up to 3 args in case the route ever passes date ranges.
export async function listShiftTypes(
  unitId?: number | string,
  from?: string,
  to?: string,
): Promise<any> {
  const params = new URLSearchParams();
  if (unitId !== undefined && unitId !== null) {
    params.set("unitIds", String(unitId));
  }
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  return plandayFetch<any>(`/api/schedule/v1/shiftTypes${query ? `?${query}` : ""}`);
}

// Used by app/api/planday/unit-revenues/route.ts
// This one *definitely* needs 3 args: (unitId, from, to)
export async function listUnitRevenues(
  unitId: number | string,
  from: string,
  to: string,
): Promise<any> {
  const params = new URLSearchParams();
  if (unitId !== undefined && unitId !== null) {
    params.set("unitIds", String(unitId));
  }
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  return plandayFetch<any>(`/api/revenue/v1/revenueUnits${query ? `?${query}` : ""}`);
}
