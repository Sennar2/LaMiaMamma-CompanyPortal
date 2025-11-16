'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { LOCATIONS as PLANDAY_LOCATIONS } from '@/data/locations';

type UserRole = 'user' | 'ops' | 'admin';

type Profile = {
  id: string;
  full_name: string | null;
  role: UserRole;
  home_location: string | null;
};

type IssueRow = {
  id: string;
  created_at: string;
  status: 'open' | 'resolved';
  priority: 'low' | 'medium' | 'high' | null;
  location_name: string;
  cost: number | null;
  areas: { name: string } | null;
  items: { name: string } | null;
};

// ────────────────────────────────────────────────────── utils
const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 2,
});
function normalizeOne<T extends Record<string, any>>(rel: any): T | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return (rel[0] as T) ?? null;
  return rel as T;
}
function toCsv(rows: Record<string, any>[]) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
}
function downloadCsv(filename: string, rows: Record<string, any>[]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ────────────────────────────────────────────────────── page
export default function MaintenancePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters (simplified UX)
  const [statusFilter, setStatusFilter] = useState<'All' | 'open' | 'resolved'>('All');
  const [locationFilter, setLocationFilter] = useState<string>('All');
  const [quick, setQuick] = useState<'all' | '7d' | '30d' | 'ytd'>('all');

  // Advanced (collapsed by default)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [monthFilter, setMonthFilter] = useState(''); // yyyy-mm
  const [fromDate, setFromDate] = useState('');       // yyyy-mm-dd
  const [toDate, setToDate] = useState('');           // yyyy-mm-dd

  const [search, setSearch] = useState('');

  // ── auth/profile
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        router.push('/login');
        return;
      }
      const { data: p } = await supabase
        .from('profiles')
        .select('id, full_name, role, home_location')
        .eq('id', u.user.id)
        .single();

      const prof = (p as Profile) || null;
      setProfile(prof);
      setAuthLoaded(true);

      if (prof?.role === 'user' && prof.home_location) {
        setLocationFilter(prof.home_location);
      }
    })();
  }, [router]);

  // ── data fetch with filters
  useEffect(() => {
    if (!authLoaded) return;

    (async () => {
      setLoading(true);

      let q = supabase
        .from('maintenance_issues')
        .select('id, created_at, status, priority, location_name, cost, areas(name), items(name)')
        .order('created_at', { ascending: false })
        .limit(2000);

      if (statusFilter !== 'All') q = q.eq('status', statusFilter);
      if (locationFilter !== 'All') q = q.eq('location_name', locationFilter);

      // quick vs advanced dates
      const now = new Date();
      if (quick !== 'all') {
        if (quick === '7d' || quick === '30d') {
          const d = new Date();
          d.setUTCDate(d.getUTCDate() - (quick === '7d' ? 7 : 30));
          q = q.gte('created_at', d.toISOString());
        } else if (quick === 'ytd') {
          const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
          q = q.gte('created_at', start.toISOString());
        }
      } else if (monthFilter) {
        const [y, m] = monthFilter.split('-').map(Number);
        const start = new Date(Date.UTC(y, m - 1, 1));
        const end = new Date(Date.UTC(y, m, 1));
        q = q.gte('created_at', start.toISOString()).lt('created_at', end.toISOString());
      } else {
        if (fromDate) q = q.gte('created_at', new Date(`${fromDate}T00:00:00.000Z`).toISOString());
        if (toDate) {
          const end = new Date(`${toDate}T00:00:00.000Z`);
          end.setUTCDate(end.getUTCDate() + 1);
          q = q.lt('created_at', end.toISOString());
        }
      }

      const { data } = await q;

      const normalized: IssueRow[] =
        (data as any[] | null)?.map(r => ({
          id: r.id,
          created_at: r.created_at,
          status: r.status,
          priority: r.priority,
          location_name: r.location_name,
          cost: r.cost ?? null,
          areas: normalizeOne<{ name: string }>(r.areas),
          items: normalizeOne<{ name: string }>(r.items),
        })) ?? [];

      setIssues(normalized);
      setLoading(false);
    })();
  }, [authLoaded, statusFilter, locationFilter, monthFilter, fromDate, toDate, quick]);

  // Locations for filter and cards
  const allLocationNames = useMemo(
    () => ['All', ...PLANDAY_LOCATIONS.map(l => l.name)],
    []
  );

  // ── search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter(i => {
      if (!q) return true;
      const hay = [i.id, i.location_name, i.areas?.name || '', i.items?.name || ''].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [issues, search]);

  // KPIs
  const totals = useMemo(() => {
    const open = filtered.filter(i => i.status === 'open').length;
    const cost = filtered.reduce((s, i) => s + (i.cost ?? 0), 0);
    return { open, cost };
  }, [filtered]);

  const priorityCounts = useMemo(() => {
    const open = filtered.filter(i => i.status === 'open');
    return {
      high: open.filter(i => i.priority === 'high').length,
      medium: open.filter(i => i.priority === 'medium').length,
      low: open.filter(i => i.priority === 'low').length,
    };
  }, [filtered]);

  // Cost cards (all sites)
  const locationCards = useMemo(() => {
    const sums = new Map<string, number>();
    for (const loc of PLANDAY_LOCATIONS) sums.set(loc.name, 0);
    for (const i of filtered) sums.set(i.location_name, (sums.get(i.location_name) ?? 0) + (i.cost ?? 0));
    const arr = Array.from(sums.entries()).map(([name, sum]) => ({ name, sum }));
    arr.sort((a, b) => (b.sum - a.sum) || a.name.localeCompare(b.name));
    return arr;
  }, [filtered]);

  const clearDates = () => {
    setQuick('all');
    setMonthFilter('');
    setFromDate('');
    setToDate('');
  };

  const exportCurrent = () => {
    const rows = filtered.map(i => ({
      id: i.id,
      created_at: new Date(i.created_at).toLocaleString('en-GB'),
      status: i.status,
      priority: i.priority ?? '',
      location: i.location_name,
      area: i.areas?.name ?? '',
      item: i.items?.name ?? '',
      cost: i.cost ?? '',
    }));
    downloadCsv(`maintenance_${Date.now()}.csv`, rows);
  };

  if (!authLoaded || !profile) {
    return (
      <main className="p-6 max-w-6xl mx-auto">
        <div className="text-sm text-gray-500 animate-pulse">Loading maintenance…</div>
      </main>
    );
  }

  return (
    <main className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Maintenance</h1>
          <p className="text-xs text-gray-500">Track issues across locations. Click a row to view &amp; update.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportCurrent} className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">Export CSV</button>
          {(profile.role === 'ops' || profile.role === 'admin') && (
            <>
              <Link href="/maintenance/admin" className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">Admin</Link>
              <Link href="/maintenance/audit" className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">Audit</Link>
            </>
          )}
          <Link href="/maintenance/new" className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm">+ New</Link>
        </div>
      </div>

      {/* Filters – redesigned (no sticky) */}
      <section className="rounded-2xl border bg-white p-4 space-y-4">
        {/* Row A: Search */}
        <div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by id, location, area, item…"
            className="w-full h-11 text-base px-3 rounded-lg border bg-white"
          />
        </div>

        {/* Row B: Main filter pills */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Status segmented */}
          <div className="space-y-1">
            <div className="text-sm text-gray-600">Status</div>
            <div className="flex gap-2">
              {(['All','open','resolved'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 h-11 rounded-full border text-sm ${
                    statusFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700'
                  }`}
                >
                  {String(s).toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Quick range */}
          <div className="space-y-1">
            <div className="text-sm text-gray-600">Quick Range</div>
            <div className="flex gap-2">
              {(['7d','30d','ytd','all'] as const).map(k => (
                <button
                  key={k}
                  onClick={() => { setQuick(k); setMonthFilter(''); setFromDate(''); setToDate(''); }}
                  className={`px-3 h-11 rounded-full border text-sm ${
                    quick === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'
                  }`}
                >
                  {k === '7d' ? 'Last 7d' : k === '30d' ? 'Last 30d' : k === 'ytd' ? 'YTD' : 'ALL'}
                </button>
              ))}
            </div>
          </div>

          {/* Location dropdown */}
            <div className="space-y-1">
              <div className="text-sm text-gray-600">Location</div>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full h-11 text-base px-3 rounded-lg border bg-white"
              >
                {allLocationNames.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
        </div>

        {/* Row C: Advanced toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="px-3 h-10 rounded-lg border bg-white text-sm"
          >
            {showAdvanced ? 'Hide advanced' : 'More filters'}
          </button>
          {(monthFilter || fromDate || toDate) && (
            <button onClick={clearDates} className="text-sm text-gray-600 underline">
              Clear dates
            </button>
          )}
        </div>

        {/* Row D: Advanced (Month/From/To) */}
        {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="text-sm text-gray-600 mb-1">Month</div>
              <input
                type="month"
                value={monthFilter}
                onChange={(e) => { setQuick('all'); setMonthFilter(e.target.value); }}
                className="w-full h-11 text-base px-3 rounded-lg border bg-white"
              />
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">From</div>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setQuick('all'); setFromDate(e.target.value); }}
                className="w-full h-11 text-base px-3 rounded-lg border bg-white"
              />
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">To</div>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setQuick('all'); setToDate(e.target.value); }}
                className="w-full h-11 text-base px-3 rounded-lg border bg-white"
              />
            </div>
          </div>
        )}
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border text-center">
          <div className="text-sm text-gray-600">Open issues (filtered)</div>
          <div className="text-2xl font-semibold text-blue-700">{totals.open}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border text-center">
          <div className="text-sm text-gray-600">Total cost (filtered)</div>
          <div className="text-xl font-semibold">{gbp.format(totals.cost)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border text-center">
          <div className="text-sm text-gray-600">All issues shown</div>
          <div className="text-xl font-semibold">{filtered.length}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border">
          <div className="text-sm text-gray-600 mb-2">Open by priority</div>
          <div className="flex gap-2 flex-wrap">
            <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs">High {priorityCounts.high}</span>
            <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-800 text-xs">Medium {priorityCounts.medium}</span>
            <span className="px-2 py-1 rounded-full bg-gray-200 text-gray-700 text-xs">Low {priorityCounts.low}</span>
          </div>
        </div>
      </section>

      {/* Cost by location (cards) */}
      <section className="bg-white rounded-2xl border p-4">
        <div className="text-sm font-medium text-gray-800 mb-3">Cost by location (filtered)</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {locationCards.map(({ name, sum }) => (
            <div key={name} className="rounded-xl border p-3 bg-gray-50">
              <div className="text-xs text-gray-500 truncate">{name}</div>
              <div className="text-lg font-semibold text-gray-900">{gbp.format(Math.round(sum))}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Table */}
      <section className="rounded-2xl border bg-white overflow-hidden">
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 text-xs font-semibold text-blue-900">
          {loading ? 'Loading…' : `${filtered.length} issues`}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left bg-blue-50 text-blue-900">
                <th className="px-4 py-3 font-semibold border-b border-blue-100">Created</th>
                <th className="px-4 py-3 font-semibold border-b border-blue-100">Location</th>
                <th className="px-4 py-3 font-semibold border-b border-blue-100">Area / Item</th>
                <th className="px-4 py-3 font-semibold border-b border-blue-100">Priority</th>
                <th className="px-4 py-3 font-semibold border-b border-blue-100">Status</th>
                <th className="px-4 py-3 font-semibold border-b border-blue-100 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">Loading…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">No issues found.</td>
                </tr>
              ) : (
                filtered.map((i) => (
                  <tr
                    key={i.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/maintenance/${i.id}`)}
                  >
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {new Date(i.created_at).toLocaleString('en-GB')}
                    </td>
                    <td className="px-4 py-3 text-gray-800">{i.location_name}</td>
                    <td className="px-4 py-3 text-gray-800">{i.areas?.name || '—'} / {i.items?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          i.priority === 'high'
                            ? 'px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs'
                            : i.priority === 'medium'
                            ? 'px-2 py-1 rounded-full bg-orange-100 text-orange-800 text-xs'
                            : i.priority === 'low'
                            ? 'px-2 py-1 rounded-full bg-gray-200 text-gray-700 text-xs'
                            : 'px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs'
                        }
                      >
                        {i.priority || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          i.status === 'open'
                            ? 'px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs'
                            : 'px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs'
                        }
                      >
                        {i.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {i.cost != null ? gbp.format(i.cost) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
