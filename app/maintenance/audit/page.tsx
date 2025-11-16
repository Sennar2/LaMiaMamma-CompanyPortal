'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type UserRole = 'user' | 'ops' | 'admin';

type Profile = {
  id: string;
  full_name: string | null;
  role: UserRole;
  home_location: string | null;
};

type Row = {
  id: number;
  created_at: string;
  issue_id: string;
  body: string | null;
  new_cost: number | null;
  author_id: string | null;
  maintenance_issues: { location_name: string } | null; // normalized
  profiles: { full_name: string | null; role: string | null } | null; // normalized
};

function normalizeOne<T extends Record<string, any>>(rel: any): T | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return (rel[0] as T) ?? null;
  return rel as T;
}

const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 2,
});

export default function MaintenanceAuditPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState<string>('All');

  useEffect(() => {
    (async () => {
      // auth + profile
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        // let RLS block, but show nothing
        setLoaded(true);
        return;
      }
      const { data: p } = await supabase
        .from('profiles')
        .select('id, full_name, role, home_location')
        .eq('id', u.user.id)
        .single();
      setProfile((p as Profile) || null);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data } = await supabase
        .from('maintenance_updates')
        .select(
          `
            id,
            created_at,
            issue_id,
            body,
            new_cost,
            author_id,
            maintenance_issues:issue_id(location_name),
            profiles:author_id(full_name, role)
          `
        )
        .order('created_at', { ascending: false })
        .limit(500);

      const normalized: Row[] =
        (data as any[] | null)?.map((r) => ({
          id: r.id,
          created_at: r.created_at,
          issue_id: r.issue_id,
          body: r.body,
          new_cost: r.new_cost,
          author_id: r.author_id,
          maintenance_issues: normalizeOne<{ location_name: string }>(r.maintenance_issues),
          profiles: normalizeOne<{ full_name: string | null; role: string | null }>(r.profiles),
        })) ?? [];

      setRows(normalized);
      setLoading(false);
    })();
  }, []);

  const allLocations = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const loc = r.maintenance_issues?.location_name;
      if (loc) set.add(loc);
    });
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      const byLoc =
        locationFilter === 'All' ||
        r.maintenance_issues?.location_name === locationFilter;

      if (!s) return byLoc;

      const hay = [
        r.issue_id,
        r.body || '',
        r.maintenance_issues?.location_name || '',
        r.profiles?.full_name || '',
        r.profiles?.role || '',
      ]
        .join(' ')
        .toLowerCase();

      return byLoc && hay.includes(s);
    });
  }, [rows, search, locationFilter]);

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Maintenance Audit</h1>
          <p className="text-xs text-gray-500">Latest 500 updates across all issues (RLS enforced)</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/maintenance" className="btn">Back to Maintenance</Link>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border bg-white p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Location</label>
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="input"
          >
            {allLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 md:max-w-sm">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-full"
            placeholder="Search author, note, issue id…"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 text-xs font-semibold text-blue-900">
          {loading ? 'Loading…' : `${filtered.length} updates`}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left bg-blue-50 text-blue-900">
                <th className="px-4 py-3 font-semibold border-b border-blue-100">When</th>
                <th className="px-4 py-3 font-semibold border-b border-blue-100">Issue</th>
                <th className="px-4 py-3 font-semibold border-b border-blue-100">Location</th>
                <th className="px-4 py-3 font-semibold border-b border-blue-100">Author</th>
                <th className="px-4 py-3 font-semibold border-b border-blue-100">Note</th>
                <th className="px-4 py-3 font-semibold border-b border-blue-100 text-right">New Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    No updates found.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {new Date(r.created_at).toLocaleString('en-GB')}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/maintenance/${r.issue_id}`}
                        className="text-blue-700 underline"
                      >
                        {r.issue_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      {r.maintenance_issues?.location_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      {(r.profiles?.full_name || '—') +
                        (r.profiles?.role ? ` (${r.profiles.role})` : '')}
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      {r.body || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.new_cost != null ? (
                        <span className="font-medium text-blue-800">
                          {gbp.format(r.new_cost)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
