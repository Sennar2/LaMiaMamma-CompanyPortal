'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Issue = {
  id: string;
  description: string;
  model: string | null;
  created_at: string;
  status: 'open' | 'resolved';
  priority: 'low' | 'medium' | 'high' | null;
  location_name: string;
  cost: number | null;
  areas: { name: string } | null;
  items: { name: string } | null;
};

type RawIssue = {
  id: string;
  description: string;
  model: string | null;
  created_at: string;
  status: 'open' | 'resolved';
  priority: 'low' | 'medium' | 'high' | null;
  location_name: string;
  cost: number | null;
  areas?: any;   // can be {name} or [{name}]
  items?: any;   // can be {name} or [{name}]
};

type Media = { file_path: string; file_type: string | null };
type Update = {
  id: number;
  body: string | null;
  created_at: string;
  author_id: string;
  new_cost: number | null;
};
type Profile = { role: 'admin' | 'ops' | 'user'; home_location: string };
type Author = { id: string; full_name: string | null; role: 'admin' | 'ops' | 'user' | null };

const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 2,
});

function badge(kind: 'status' | 'priority', value?: string | null) {
  if (kind === 'status') {
    return value === 'open'
      ? 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800'
      : 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800';
  }
  if (value === 'high')
    return 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800';
  if (value === 'medium')
    return 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800';
  return 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800';
}

// Normalize {name} or [{name}] → {name} | null
function normalizeNameField(v: any): { name: string } | null {
  if (!v) return null;
  if (Array.isArray(v)) {
    const first = v[0];
    if (first && typeof first.name === 'string') return { name: first.name };
    return null;
  }
  if (typeof v === 'object' && typeof v.name === 'string') {
    return { name: v.name };
  }
  return null;
}

export default function IssueDetailPage() {
  // Safe params extraction (handles undefined/null)
  const params = useParams<{ id?: string }>();
  const id = params?.id ?? '';
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [signedUrls, setSignedUrls] = useState<string[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [authorMap, setAuthorMap] = useState<Map<string, Author>>(new Map());
  const [note, setNote] = useState('');
  const [newQuote, setNewQuote] = useState<string>(''); // £ optional
  const [loading, setLoading] = useState(true);

  const isAdminOps = profile?.role === 'admin' || profile?.role === 'ops';
  const isUser = profile?.role === 'user';

  useEffect(() => {
    if (!id) return;

    (async () => {
      setLoading(true);

      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setLoading(false);
        return;
      }

      // Profile
      const { data: pr } = await supabase
        .from('profiles')
        .select('role, home_location')
        .eq('id', u.user.id)
        .single();
      setProfile(pr as Profile);

      // Issue (normalize areas/items that may arrive as arrays)
      const { data: iss } = await supabase
        .from('maintenance_issues')
        .select(
          'id, description, model, created_at, status, priority, location_name, cost, areas(name), items(name)'
        )
        .eq('id', id)
        .single();

      const raw = iss as RawIssue | null;
      if (raw) {
        const normalized: Issue = {
          id: raw.id,
          description: raw.description,
          model: raw.model,
          created_at: raw.created_at,
          status: raw.status,
          priority: raw.priority,
          location_name: raw.location_name,
          cost: raw.cost,
          areas: normalizeNameField(raw.areas),
          items: normalizeNameField(raw.items),
        };
        setIssue(normalized);
      } else {
        setIssue(null);
      }

      // Media (try signed URLs then public fallback)
      const { data: m } = await supabase
        .from('maintenance_media')
        .select('file_path, file_type')
        .eq('issue_id', id);

      const mediaRows = (m as Media[]) || [];
      setMedia(mediaRows);

      if (mediaRows.length) {
        const paths = mediaRows.map((x) => x.file_path);

        let urls: string[] = [];
        try {
          const { data: signed, error: signErr } = await supabase.storage
            .from('maintenance-evidence')
            .createSignedUrls(paths, 60 * 60 * 24); // 24h
          if (!signErr && signed?.length) {
            urls = signed.map((s) => s.signedUrl);
          }
        } catch {
          // ignore; try public below
        }

        if (!urls.length) {
          urls = paths
            .map((p) => {
              const { data } = supabase.storage.from('maintenance-evidence').getPublicUrl(p);
              return data?.publicUrl || '';
            })
            .filter(Boolean);
        }

        setSignedUrls(urls);
      }

      // Updates
      const { data: ups } = await supabase
        .from('maintenance_updates')
        .select('id, body, created_at, author_id, new_cost')
        .eq('issue_id', id)
        .order('created_at', { ascending: false });
      const updatesArr = (ups as Update[]) || [];
      setUpdates(updatesArr);

      // Authors
      const authorIds = Array.from(new Set(updatesArr.map((u) => u.author_id)));
      if (authorIds.length) {
        const { data: authors } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .in('id', authorIds);
        const map = new Map<string, Author>();
        (authors || []).forEach((a) => map.set(a.id, a as Author));
        setAuthorMap(map);
      }

      setLoading(false);
    })();
  }, [id]);

  const userCanUpdate =
    (isAdminOps && !!issue) || (isUser && !!issue && profile?.home_location === issue.location_name);

  async function addUpdate() {
    const body = note.trim();
    const quote = newQuote.trim();
    if (!body && !quote) return;

    const parsedCost = quote === '' ? null : Number(parseFloat(quote).toFixed(2));
    if (quote !== '' && (isNaN(Number(quote)) || parsedCost! < 0)) {
      alert('Please enter a valid non-negative cost.');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from('maintenance_updates').insert({
      issue_id: id,
      author_id: user?.id,
      body: body || null,
      new_cost: parsedCost,
    });

    setNote('');
    setNewQuote('');

    // Reload updates
    const { data: ups } = await supabase
      .from('maintenance_updates')
      .select('id, body, created_at, author_id, new_cost')
      .eq('issue_id', id)
      .order('created_at', { ascending: false });
    setUpdates((ups as Update[]) || []);

    // Reload issue (trigger may have updated cost)
    const { data: iss2 } = await supabase
      .from('maintenance_issues')
      .select(
        'id, description, model, created_at, status, priority, location_name, cost, areas(name), items(name)'
      )
      .eq('id', id)
      .single();

    const raw2 = iss2 as RawIssue | null;
    setIssue(
      raw2
        ? {
            id: raw2.id,
            description: raw2.description,
            model: raw2.model,
            created_at: raw2.created_at,
            status: raw2.status,
            priority: raw2.priority,
            location_name: raw2.location_name,
            cost: raw2.cost,
            areas: normalizeNameField(raw2.areas),
            items: normalizeNameField(raw2.items),
          }
        : null
    );
  }

  async function markResolved() {
    await supabase
      .from('maintenance_issues')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', id);
    router.push('/maintenance');
  }

  async function reopenIssue() {
    const reason = window.prompt('Reason to re-open this issue? (optional)');
    await supabase.from('maintenance_issues').update({ status: 'open', resolved_at: null }).eq('id', id);

    if (reason && reason.trim()) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase
        .from('maintenance_updates')
        .insert({ issue_id: id, author_id: user?.id, body: `Re-opened: ${reason.trim()}` });
    }

    const { data: iss3 } = await supabase
      .from('maintenance_issues')
      .select(
        'id, description, model, created_at, status, priority, location_name, cost, areas(name), items(name)'
      )
      .eq('id', id)
      .single();

    const raw3 = iss3 as RawIssue | null;
    setIssue(
      raw3
        ? {
            id: raw3.id,
            description: raw3.description,
            model: raw3.model,
            created_at: raw3.created_at,
            status: raw3.status,
            priority: raw3.priority,
            location_name: raw3.location_name,
            cost: raw3.cost,
            areas: normalizeNameField(raw3.areas),
            items: normalizeNameField(raw3.items),
          }
        : null
    );
  }

  async function exportPDF() {
    if (!issue) return;

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const mm = (v: number) => v * 2.83465;
    let y = mm(20);

    doc.setFontSize(16);
    doc.text('Maintenance Issue', mm(20), y);
    y += mm(10);

    doc.setFontSize(11);
    autoTable(doc, {
      startY: y,
      theme: 'plain',
      styles: { cellPadding: 4 },
      body: [
        ['ID', issue.id],
        ['Created', new Date(issue.created_at).toLocaleString()],
        ['Location', issue.location_name],
        ['Area / Item', `${issue.areas?.name || ''} / ${issue.items?.name || ''}`],
        ['Priority', issue.priority || '-'],
        ['Status', issue.status],
        ['Model', issue.model || '-'],
        ['Cost', issue.cost != null ? gbp.format(issue.cost) : '-'],
      ],
      columnStyles: { 0: { fontStyle: 'bold', textColor: [100, 100, 100] } },
    });
    y = (doc as any).lastAutoTable.finalY + mm(6);

    // Description
    doc.setFontSize(12);
    doc.text('Description', mm(20), y);
    y += mm(5);
    autoTable(doc, {
      startY: y,
      theme: 'grid',
      styles: { cellPadding: 6 },
      head: [['Text']],
      body: [[issue.description || '']],
    });
    y = (doc as any).lastAutoTable.finalY + mm(8);

    // Embed first 2 images if available
    const imageUrls = signedUrls.filter((u) => /\.(png|jpe?g|gif)(\?|$)/i.test(u)).slice(0, 2);
    for (const url of imageUrls) {
      try {
        const dataUrl = await urlToDataUrl(url);
        doc.addImage(dataUrl, 'JPEG', mm(20), y, mm(160), mm(90));
        y += mm(96);
      } catch {
        // ignore
      }
    }

    // Updates
    if (updates.length) {
      if (y > mm(260)) doc.addPage(), (y = mm(20));
      doc.setFontSize(12);
      doc.text('Updates', mm(20), y);
      y += mm(5);

      const rows = updates.map((u) => {
        const a = authorMap.get(u.author_id);
        const costTxt = u.new_cost != null ? ` | Set cost: ${gbp.format(u.new_cost)}` : '';
        return [
          new Date(u.created_at).toLocaleString(),
          a?.full_name ? `${a.full_name}${a?.role ? ` (${a.role})` : ''}` : '—',
          ((u.body || '') + costTxt).trim(),
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [['When', 'Author', 'Note']],
        body: rows,
        styles: { fontSize: 10, cellPadding: 4 },
        headStyles: { fillColor: [240, 245, 255], textColor: [20, 30, 60] },
      });
    }

    // Portal link (if in browser)
    try {
      const href = window.location.href;
      doc.setFontSize(10);
      doc.text(`Open in portal: ${href}`, mm(20), mm(285));
    } catch {}

    doc.save(`issue_${issue.id}.pdf`);
  }

  function urlToDataUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('no ctx');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  if (!id) return <div className="rounded-2xl border bg-white p-4">Loading…</div>;
  if (loading) return <div className="rounded-2xl border bg-white p-4">Loading…</div>;
  if (!issue) return <div className="rounded-2xl border bg-white p-4">Issue not found.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">
            {issue.areas?.name || '—'} · {issue.items?.name || '—'}
          </h1>
          <span className={badge('priority', issue.priority)}>{issue.priority || '—'}</span>
          <span className={badge('status', issue.status)}>{issue.status}</span>
        </div>

        <div className="flex gap-2">
          <button onClick={exportPDF} className="btn">Export PDF</button>
          {issue.status === 'resolved' && (profile?.role === 'admin' || profile?.role === 'ops') && (
            <button onClick={reopenIssue} className="btn">Re-open</button>
          )}
          <Link href="/maintenance" className="btn">Back</Link>
          <Link href="/maintenance/new" className="btn btn-primary">New</Link>
        </div>
      </div>

      {/* Meta / Description / Media */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-8 text-sm">
          <div><b>Created:</b> {new Date(issue.created_at).toLocaleString()}</div>
          <div><b>Location:</b> {issue.location_name}</div>
          <div><b>Status:</b> <span className="capitalize">{issue.status}</span></div>
          <div><b>Model:</b> {issue.model || '-'}</div>
          <div><b>Cost:</b> {issue.cost != null ? gbp.format(issue.cost) : <span className="text-gray-500">—</span>}</div>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium mb-1">Description</div>
          <div className="rounded-xl border bg-white p-3 whitespace-pre-wrap">{issue.description}</div>
        </div>

        {signedUrls.length > 0 && (
          <div className="mt-4">
            <div className="text-sm font-medium mb-1">Media</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {signedUrls.map((u, i) => (
                <div key={i} className="rounded-xl border overflow-hidden">
                  {/\.(mp4|webm|mov|avi|mkv|m4v)(\?|$)/i.test(u)
                    ? <video src={u} controls className="w-full" preload="metadata" />
                    : <img src={u} alt={`Media ${i + 1}`} className="w-full" loading="lazy" />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Updates */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="font-medium mb-2">Updates</div>

        {updates.length === 0 ? (
          <div className="text-sm text-gray-600">No updates yet.</div>
        ) : (
          <ul className="space-y-2">
            {updates.map((u) => {
              const a = authorMap.get(u.author_id);
              return (
                <li key={u.id} className="rounded-xl border p-3 bg-white">
                  <div className="text-xs text-gray-500">
                    {new Date(u.created_at).toLocaleString()} — {a?.full_name ?? 'Unknown'}{a?.role ? ` (${a.role})` : ''}
                  </div>
                  <div className="text-sm whitespace-pre-wrap mt-1">
                    {u.body || <span className="text-gray-500">—</span>}
                  </div>
                  {u.new_cost != null && (
                    <div className="mt-1 text-xs inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      Set cost: {gbp.format(u.new_cost)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {(userCanUpdate && issue.status === 'open') && (
          <div className="mt-3 space-y-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm">Add update</span>
              <textarea
                className="textarea"
                placeholder="Chased supplier / Engineer attended / Awaiting part…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 max-w-xs">
              <span className="text-sm">New quote / cost (£, optional)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                className="input"
                placeholder="e.g., 180.00"
                value={newQuote}
                onChange={(e) => setNewQuote(e.target.value)}
              />
            </label>

            <div className="flex gap-2">
              <button onClick={addUpdate} className="btn">Save update</button>
              {(profile?.role === 'admin' || profile?.role === 'ops') && (
                <button onClick={markResolved} className="btn btn-primary">Mark as completed</button>
              )}
            </div>
          </div>
        )}

        {issue.status === 'resolved' && (
          <div className="text-sm text-green-700 mt-2">This issue is marked as completed.</div>
        )}
      </div>
    </div>
  );
}
