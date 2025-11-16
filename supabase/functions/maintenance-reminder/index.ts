// Sends reminder emails for issues open 3+ days (one-time per issue).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APPS_SCRIPT_WEBHOOK =
  Deno.env.get('APPS_SCRIPT_WEBHOOK') ||
  'https://script.google.com/macros/s/AKfycbwCO7_qJWrhTFBBn_wkByrUxz3mQRRlhCV3gp22jSuN5r1NI9Tr5IQIlUFfO1_hvwdmOg/exec';
const MEDIA_BUCKET = 'maintenance-evidence';
const PUBLIC_PORTAL_ISSUE_URL_BASE =
  Deno.env.get('PUBLIC_PORTAL_ISSUE_URL_BASE') || 'http://localhost:3000/maintenance/';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async () => {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // Find open issues older than 3 days and not yet reminded
  const { data: issues, error } = await supabase
    .from('maintenance_issues')
    .select('id, description, model, created_at, priority, status, location_name, areas(name), items(name), created_by, reminder_sent_3d')
    .eq('status', 'open')
    .eq('reminder_sent_3d', false)
    .lte('created_at', threeDaysAgo)
    .order('created_at');

  if (error) return new Response(JSON.stringify({ error: String(error) }), { status: 500 });

  for (const issue of issues || []) {
    // creator (optional)
    const { data: creator } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', issue.created_by)
      .single();

    // media (first few)
    const { data: media } = await supabase
      .from('maintenance_media')
      .select('file_path')
      .eq('issue_id', issue.id);

    let signed: string[] = [];
    if (media?.length) {
      const paths = media.map((m: any) => m.file_path);
      const { data: signedData } = await supabase
        .storage.from(MEDIA_BUCKET)
        .createSignedUrls(paths, 60 * 60 * 24);
      signed = (signedData || []).map((s: any) => s.signedUrl);
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
      createdBy: creator?.full_name || '',
      createdByRole: creator?.role || '',
      openUrl: `${PUBLIC_PORTAL_ISSUE_URL_BASE}${issue.id}`,
      media: signed,
      isReminder: true, // <-- tell Apps Script to prefix subject
    };

    await fetch(APPS_SCRIPT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Mark reminded
    await supabase
      .from('maintenance_issues')
      .update({ reminder_sent_3d: true })
      .eq('id', issue.id);
  }

  return new Response(JSON.stringify({ ok: true, count: issues?.length || 0 }), { headers: { 'Content-Type': 'application/json' } });
});
