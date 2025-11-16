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

const AREA_EMOJI: Record<string, string> = {
  kitchen: '🍳',
  bar: '🍸',
  'dining area': '🍽️',
  storage: '📦',
  toilet: '🚻',
  office: '🗂️',
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function OpenMaintenanceList({
  locationName,
  limit = 10,
  className = '',
}: {
  locationName?: string;
  limit?: number;
  className?: string;
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

    const channel = supabase
      .channel('maintenance-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_issues' },
        () => load(),
      )
      .subscribe();

    return () => {
      // Make cleanup synchronous: don't *return* the Promise
      void supabase.removeChannel(channel);
      // or: supabase.removeChannel(channel).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationName, limit]);

  return (
    <div className={`w-full max-w-none ${className}`}>
      <div className="w-full rounded-2xl border bg-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between bg-blue-50/70 border-b border-blue-100 px-5 py-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-900">
            <span className="text-sm" aria-hidden>
              🛠️
            </span>
            {loading ? 'Loading…' : `${issues.length} open issues`}
          </div>
          <Link href="/maintenance?status=open" className="text-[11px] text-blue-700 hover:text-blue-800 underline">
            View all →
          </Link>
        </div>

        {/* Body */}
        {loading ? (
          <ul className="divide-y">
            {[...Array(4)].map((_, i) => (
              <li key={i} className="px-5 py-4">
                <div className="animate-pulse space-y-2">
                  <div className="h-3 w-48 bg-gray-200 rounded" />
                  <div className="h-3 w-80 bg-gray-200 rounded" />
                  <div className="h-2 w-40 bg-gray-200 rounded" />
                </div>
              </li>
            ))}
          </ul>
        ) : issues.length === 0 ? (
          <div className="px-5 py-6 text-center text-gray-500 text-sm">
            No open issues{locationName && locationName !== 'All' ? ` for ${locationName}` : ''}. 🎉
          </div>
        ) : (
          <ul className="divide-y">
            {issues.map((i) => {
              const area = i.areas?.name || '—';
              const item = i.items?.name || '—';
              const emoji = AREA_EMOJI[area.toLowerCase?.() || ''] || '🧰';
              return (
                <li key={i.id} className="px-5 py-3 hover:bg-gray-50">
                  <Link href={`/maintenance?id=${i.id}`} className="block">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[15px] font-semibold text-gray-900">
                          <span className="shrink-0" aria-hidden>
                            {emoji}
                          </span>
                          <span className="truncate">
                            {area} / {item}
                          </span>
                        </div>
                        <div className="mt-0.5 text-sm text-gray-600 truncate">
                          {i.description || 'No description'}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                          <span title={new Date(i.created_at).toLocaleString('en-GB')}>
                            {timeAgo(i.created_at)}
                          </span>
                          <span>•</span>
                          <span className="inline-flex items-center rounded-full bg-gray-100 border border-gray-200 px-2 py-0.5 text-[10px] text-gray-700">
                            {i.location_name}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-1 text-[11px] font-semibold text-yellow-800">
                        OPEN
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
