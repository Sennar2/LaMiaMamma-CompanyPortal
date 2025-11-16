// app/api/admin/create-user/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { LOCATIONS as PLANDAY_LOCATIONS } from '@/data/locations';

export const runtime = 'nodejs';

type Body = {
  email: string;
  password?: string;               // optional; auto-generated if missing
  full_name?: string;
  role: 'user' | 'ops' | 'admin';
  home_location?: string | null;
};

function generateTempPassword() {
  const s = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
  return s.replace(/[^a-zA-Z0-9]/g, 'A');
}

/**
 * Next 15: cookies() is async in route handlers.
 * Try to extract a Supabase access token from cookies.
 */
async function getAccessTokenFromCookies(): Promise<string | null> {
  const jar = await cookies();

  // 1) legacy cookie
  const legacy = jar.get('sb-access-token')?.value;
  if (legacy) return legacy;

  // 2) new helper cookie: sb-<project-ref>-auth-token (JSON)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const match = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
  const ref = match?.[1];
  if (ref) {
    const key = `sb-${ref}-auth-token`;
    const raw = jar.get(key)?.value;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const token: string | undefined =
          parsed?.currentSession?.access_token || parsed?.access_token;
        if (token) return token;
      } catch {
        // ignore parse errors
      }
    }
  }
  return null;
}

async function getCallerProfile() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const accessToken = await getAccessTokenFromCookies();
  if (!accessToken) return null;

  const supabase = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: prof } = await supabase
    .from('profiles')
    .select('id, role, home_location, full_name')
    .eq('id', user.id)
    .single();

  if (!prof) return null;
  return { user, profile: prof };
}

export async function POST(req: Request) {
  try {
    // 1) Only admins can create users
    const caller = await getCallerProfile();
    if (!caller || caller.profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2) Input
    const body = (await req.json()) as Body;
    const email = body.email?.trim();
    const role = body.role;
    const password = body.password || generateTempPassword();
    const full_name = body.full_name ?? null;
    const home_location = body.home_location ?? null;

    if (!email || !role) {
      return NextResponse.json({ error: 'Missing email/role' }, { status: 400 });
    }
    if (!['user', 'ops', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    if (home_location) {
      const ok = PLANDAY_LOCATIONS.some((l) => l.name === home_location);
      if (!ok) {
        return NextResponse.json({ error: 'Invalid home_location' }, { status: 400 });
      }
    }

    // 3) Admin client (Service Role Key on server)
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SRK) {
      return NextResponse.json(
        { error: 'Server missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      );
    }
    const admin = createClient(SUPABASE_URL, SRK, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 4) Create auth user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr) {
      if (String(createErr.message).toLowerCase().includes('already')) {
        return NextResponse.json({ error: 'User already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }
    const userId = created.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'No user id returned' }, { status: 500 });
    }

    // 5) Upsert profile
    const { error: upErr } = await admin
      .from('profiles')
      .upsert({ id: userId, full_name, role, home_location }, { onConflict: 'id' });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    // 6) Done
    return NextResponse.json({ ok: true, user_id: userId }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
