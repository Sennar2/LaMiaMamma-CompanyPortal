'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { LOCATIONS as PLANDAY_LOCATIONS } from '@/data/locations';

type Area = { id: number; name: string };
type Item = { id: number; area_id: number; name: string };
type Profile = { role: 'admin' | 'ops' | 'user'; home_location: string | null };

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ---- helper: call Edge Function with explicit headers (JWT + apikey) ----
async function notifyMaintenance(issueId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No auth session/token');

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify-maintenance`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify({ issueId }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`notify-maintenance ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { ok: true, raw: text }; }
}

export default function MaintenanceReportForm() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [selectedArea, setSelectedArea] = useState<number | ''>('');
  const [itemId, setItemId] = useState<number | ''>('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [locationName, setLocationName] = useState<string>('');
  const [model, setModel] = useState('');
  const [description, setDescription] = useState('');
  const [initialCost, setInitialCost] = useState<string>(''); // £ optional
  const [files, setFiles] = useState<FileList | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdminOps = profile?.role === 'admin' || profile?.role === 'ops';

  const filteredItems = useMemo(
    () => items.filter((i) => (selectedArea ? i.area_id === selectedArea : true)),
    [items, selectedArea]
  );

  useEffect(() => {
    (async () => {
      const [{ data: a }, { data: it }] = await Promise.all([
        supabase.from('areas').select('id,name').order('name'),
        supabase.from('items').select('id,area_id,name').order('name'),
      ]);
      setAreas(a || []);
      setItems(it || []);

      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;

      const { data: pr } = await supabase
        .from('profiles')
        .select('role, home_location')
        .eq('id', u.user.id)
        .single();

      const p = pr as Profile | null;
      setProfile(p);

      if (p?.role === 'user') setLocationName(p?.home_location || '');
      else setLocationName(PLANDAY_LOCATIONS[0]?.name || '');
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error('Please sign in.');

      if (!selectedArea || !itemId) throw new Error('Please select Area and Item.');
      if (!locationName) throw new Error('Please select a Location.');
      if (!description.trim()) throw new Error('Please enter a description.');

      // parse optional cost
      const parsedCost = initialCost.trim() === '' ? null : Number(parseFloat(initialCost).toFixed(2));
      if (initialCost.trim() !== '' && (isNaN(Number(initialCost)) || parsedCost! < 0)) {
        throw new Error('Please enter a valid non-negative cost.');
      }

      // 1) Create the issue (now includes cost)
      const { data: issue, error: iErr } = await supabase
        .from('maintenance_issues')
        .insert({
          location_name: locationName,
          area_id: selectedArea,
          item_id: itemId,
          model: model || null,
          description: description.trim(),
          priority,
          created_by: u.user.id,
          cost: parsedCost, // <— NEW
        })
        .select('id')
        .single();
      if (iErr) throw iErr;

      // 2) Upload files (optional)
      if (files?.length) {
        const uploadedPaths: string[] = [];
        for (const file of Array.from(files)) {
          const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
          const path = `location/${slugify(locationName)}/${issue.id}/${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}.${ext}`;

          const { error: upErr } = await supabase
            .storage
            .from('maintenance-evidence')
            .upload(path, file, {
              cacheControl: '3600',
              upsert: false,
              contentType: file.type || undefined,
            });
          if (upErr) throw upErr;

          uploadedPaths.push(path);
        }
        if (uploadedPaths.length) {
          const rows = uploadedPaths.map((p) => ({ issue_id: issue.id, file_path: p, file_type: null }));
          const { error: mErr } = await supabase.from('maintenance_media').insert(rows);
          if (mErr) throw mErr;
        }
      }

      // 3) Notify via Edge Function
      try {
        const notifyRes = await notifyMaintenance(issue.id);
        if (!notifyRes?.ok) console.warn('notify-maintenance returned non-ok:', notifyRes);
      } catch (err: any) {
        console.error('notify-maintenance failed:', err?.message || err);
        alert(`Email notify failed:\n${err?.message || err}`);
      }

      // 4) Redirect with toast
      router.push('/maintenance?created=1');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Report Maintenance Issue</h2>
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={() => router.push('/maintenance')}>Cancel</button>
          <button disabled={loading} className="btn btn-primary">{loading ? 'Submitting…' : 'Submit issue'}</button>
        </div>
      </div>

      {/* Location & Priority */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm">Location</span>
          {isAdminOps ? (
            <select className="select" value={locationName} onChange={(e) => setLocationName(e.target.value)} required>
              {PLANDAY_LOCATIONS.map((l) => (
                <option key={l.id} value={l.name}>{l.name}</option>
              ))}
            </select>
          ) : (
            <input className="input" value={locationName} disabled />
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm">Priority</span>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as any)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>

      {/* Area & Item */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm">Area</span>
          <select
            className="select"
            value={selectedArea as any}
            onChange={(e) => { setSelectedArea(Number(e.target.value) as any); setItemId(''); }}
            required
          >
            <option value="">Select…</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm">Item</span>
          <select
            className="select"
            value={itemId as any}
            onChange={(e) => setItemId(Number(e.target.value) as any)}
            required
            disabled={!selectedArea}
          >
            <option value="">Select…</option>
            {filteredItems.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Model */}
      <label className="flex flex-col gap-1">
        <span className="text-sm">Model</span>
        <input
          className="input"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="e.g., Polar CM4360"
        />
      </label>

      {/* Description */}
      <label className="flex flex-col gap-1">
        <span className="text-sm">Issue description</span>
        <textarea
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          placeholder="Describe what’s wrong, error codes, when it started, etc."
        />
      </label>

      {/* Cost (optional) */}
      <label className="flex flex-col gap-1">
        <span className="text-sm">Cost (£, optional)</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          className="input"
          placeholder="e.g., 120.00"
          value={initialCost}
          onChange={(e) => setInitialCost(e.target.value)}
        />
        <span className="text-xs text-gray-500">You can change this later via updates (new quotes).</span>
      </label>

      {/* Files */}
      <label className="flex flex-col gap-1">
        <span className="text-sm">Photos / short video (optional)</span>
        <input type="file" accept="image/*,video/*" multiple onChange={(e) => setFiles(e.target.files)} />
        <span className="text-xs text-gray-500">Images or short videos under ~25MB each recommended.</span>
      </label>

      {error && <div className="text-red-700">{error}</div>}
    </form>
  );
}
