// supabase/functions/notify-maintenance/index.ts
// Sends a maintenance alert email via Google Apps Script.
// Returns clear error bodies to the client for quick debugging.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const APPS_SCRIPT_WEBHOOK =
  Deno.env.get('APPS_SCRIPT_WEBHOOK') ||
  'https://script.google.com/macros/s/AKfycbwCO7_qJWrhTFBBn_wkByrUxz3mQRRlhCV3gp22jSuN5r1NI9Tr5IQIlUFfO1_hvwdmOg/exec';
const PUBLIC_PORTAL_ISSUE_URL_BASE =
  Deno.env.get('PUBLIC_PORTAL_ISSUE_URL_BASE') || 'http://localhost:3000/maintenance/';
const MEDIA_BUCKET = 'maintenance-evidence';

function cors(body: unknown, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return cors({}, 200);
  if (req.method === 'GET') {
    return cors({
      ok: true,
      message: 'notify-maintenance is deployed',
      env: {
        has_SUPABASE_URL: !!SUPABASE_URL,
        has_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY,
        has_APPS_SCRIPT_WEBHOOK: !!APPS_SCRIPT_WEBHOOK,
      },
    });
  }
  if (req.method !== 'POST') return cors({ error: 'Method not allowed' }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return cors(
      { ok: false, step: 'env', error: 'Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY secrets.' },
      500
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return cors({ ok: false, step: 'parse', error: 'Invalid JSON body' }, 400);
    }
    const issueId = body?.issueId as string | undefined;
    if (!issueId) return cors({ ok: false, step: 'validate', error: 'Missing issueId' }, 400);

    const { data: issue, error: issueErr } = await supabase
      .from('maintenance_issues')
      .select(
        'id, description, model, created_at, status, priority, location_name, areas(name), items(name), created_by'
      )
      .eq('id', issueId)
      .single();

    if (issueErr || !issue) {
      return cors({ ok: false, step: 'load_issue', error: String(issueErr || 'Issue not found') }, 500);
    }

    let createdByName = '';
    let createdByRole = '';
    if (issue.created_by) {
      const { data: creator } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', issue.created_by)
        .single();
      createdByName = creator?.full_name || '';
      createdByRole = (creator as any)?.role || '';
    }

    let signed: string[] = [];
    try {
      const { data: mediaRows } = await supabase
        .from('maintenance_media')
        .select('file_path')
        .eq('issue_id', issue.id);

      if (mediaRows?.length) {
        const paths = mediaRows.map((m: any) => m.file_path);
        const { data: signedData } = await supabase
          .storage
          .from(MEDIA_BUCKET)
          .createSignedUrls(paths, 60 * 60 * 24);
        signed = (signedData || []).map((s: any) => s.signedUrl);
      }
    } catch {
      // continue without media
    }

    const payload = {
      id: issue.id,
      createdAt: issue.created_at,
      location: issue.location_name,
      area: issue.areas?.name || '',
      item: issue.items?.name || '',
      model: issue.model || '',
      priority: issue.priority || '',
      status: issue.status,
      description: issue.description || '',
      createdBy: createdByName,
      createdByRole,
      openUrl: `${PUBLIC_PORTAL_ISSUE_URL_BASE}${issue.id}`,
      media: signed,
    };

    const scriptRes = await fetch(APPS_SCRIPT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const scriptText = await scriptRes.text();

    if (!scriptRes.ok) {
      return cors(
        {
          ok: false,
          step: 'apps_script',
          status: scriptRes.status,
          body: scriptText,
          hint:
            scriptRes.status === 403
              ? 'Apps Script must be deployed as Web App (Execute as: Me; Who has access: Anyone). Update APPS_SCRIPT_WEBHOOK to CURRENT URL.'
              : undefined,
        },
        502
      );
    }

    return cors({ ok: true, apps_script: { status: scriptRes.status, body: scriptText } }, 200);
  } catch (e) {
    return cors({ ok: false, step: 'fatal', error: String(e) }, 500);
  }
});
