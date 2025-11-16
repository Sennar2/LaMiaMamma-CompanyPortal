'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Issue = {
  id: string;
  description: string | null;
  created_at: string;
  status: 'open' | 'resolved';
  location_name: string;
  areas: { name: string } | null;
  items: { name: string } | null;
};

function normalizeOne<T extends Record<string, any>>(rel: any): T | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return (rel[0] as T) ?? null;
  return rel as T;
}

export default function OpenMaintenanceList({
  locationName,
  limit = 10,
}: {
  locationName?: string;
  limit?: number;
}) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    let query = supabase
      .from('maintenance_issues')
      .select('id, description, created_at, status, location_name, areas(name), items(name)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (locationName && locationName !== 'All') {
      query = query.eq('location_name', locationName);
    }

    const { data } = await query;

    const normalized: Issue[] =
      ((data as any[]) ?? []).map((r) => ({
        id: r.id,
        description: r.description ?? null,
        created_at: r.created_at,
        status: r.status,
        location_name: r.location_name,
        areas: normalizeOne<{ name: string }>(r.areas),
        items: normalizeOne<{ name: string }>(r.items),
      })) ?? [];

    setIssues(normalized);
    setLoading(false);
  }

  useEffect(() => {
    load();

    // Realtime refresh on inserts/updates (optional nice-to-have)
    const channel = supabase
      .channel('maintenance-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_issues' },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationName, limit]);

  return (
    <div className="rounded-2xl border bg-white overflow-hidden">
      <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 text-xs font-semibold text-blue-900">
        {loading ? 'Loading…' : `${issues.length} open issues`}
      </div>

      {loading ? (
        <div className="px-4 py-6 text-center text-gray-500 text-sm">Loading…</div>
      ) : issues.length === 0 ? (
        <div className="px-4 py-6 text-center text-gray-500 text-sm">
          No open issues{locationName && locationName !== 'All' ? ` for ${locationName}` : ''}.
        </div>
      ) : (
        <ul className="divide-y">
          {issues.map((i) => (
            <li key={i.id} className="px-4 py-3 hover:bg-gray-50">
              <Link href={`/maintenance/${i.id}`} className="block">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {(i.areas?.name || '—')} / {(i.items?.name || '—')}
                    </div>
                    <div className="text-xs text-gray-600 truncate">
                      {i.description || 'No description'}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {new Date(i.created_at).toLocaleString('en-GB')} · {i.location_name}
                    </div>
                  </div>
                  <span className="shrink-0 ml-3 inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-[11px] font-medium text-yellow-800">
                    OPEN
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="px-4 py-2 border-t text-right">
        <Link href="/maintenance" className="text-xs text-blue-700 underline">
          View all →
        </Link>
      </div>
    </div>
  );
}
