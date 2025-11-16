// @ts-nocheck
// Sends reminder emails for open issues older than 7 days via the same Apps Script.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const APPS_SCRIPT_WEBHOOK = Deno.env.get('APPS_SCRIPT_WEBHOOK') || '';
const PUBLIC_PORTAL_ISSUE_URL_BASE = Deno.env.get('PUBLIC_PORTAL_ISSUE_URL_BASE') || '';

Deno.serve(async (_req) => {
  try {
    if (!SUPABASE_URL || !SRK || !APPS_SCRIPT_WEBHOOK) {
      throw new Error('Missing required env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / APPS_SCRIPT_WEBHOOK');
    }

    const supabase = createClient(SUPABASE_URL, SRK, { global: { fetch } });

    // Find issues open >= 7 days
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceIso = since.toISOString();

    const { data: issues, error } = await supabase
      .from('maintenance_issues')
      .select(`
        id,
        created_at,
        status,
        priority,
        location_name,
        description,
        cost,
        areas(name),
        items(name),
        created_by,
        profiles:created_by(full_name, role)
      `)
      .eq('status', 'open')
      .lte('created_at', sinceIso)
      .limit(500);

    if (error) throw error;

    // Normalize possible array relations for areas/items/profiles (Deno runtime only)
    const payloads = (issues ?? []).map((i: any) => {
      const area = Array.isArray(i.areas) ? i.areas[0]?.name : i.areas?.name;
      const item = Array.isArray(i.items) ? i.items[0]?.name : i.items?.name;
      const creator = Array.isArray(i.profiles) ? i.profiles[0] : i.profiles;

      return {
        isReminder: true,
        issueId: i.id,
        openUrl: `${PUBLIC_PORTAL_ISSUE_URL_BASE}${i.id}`,
        location: i.location_name,
        area: area || '',
        item: item || '',
        priority: i.priority || 'medium',
        description: i.description || '',
        cost: i.cost ?? null,
        createdAt: i.created_at,
        createdBy: creator?.full_name || '',
        createdByRole: creator?.role || '',
        media: [],
      };
    });

    let sent = 0, failed = 0;
    for (const p of payloads) {
      const res = await fetch(APPS_SCRIPT_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      if (res.ok) sent++; else failed++;
    }

    return new Response(JSON.stringify({ ok: true, sent, failed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
