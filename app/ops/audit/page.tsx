"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { LOCATIONS as PLANDAY_LOCATIONS } from "@/data/locations";

type LogRow = {
  id: number;
  user_id: string | null;
  location: string;
  date: string; // yyyy-mm-dd
  action: string;
  checked_ids: string[];
  checked_count: number;
  notes_len: number;
  client_ts: string; // iso
  inserted_at: string; // iso
};

type Profile = { id: string; full_name: string | null; role: "user" | "ops" | "admin" };

export default function OpsAuditPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [loc, setLoc] = useState<string>("All");
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [userLike, setUserLike] = useState<string>("");

  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  const locations = useMemo(() => ["All", ...PLANDAY_LOCATIONS.map((l) => l.name)], []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        let q = supabase
          .from("daily_ops_log")
          .select("*")
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: false })
          .order("inserted_at", { ascending: false });

        if (loc !== "All") {
          q = q.eq("location", loc);
        }

        const { data, error } = await q;
        if (error) throw error;

        const list = (data || []) as LogRow[];

        // Fetch profile names for distinct user_ids
        const ids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
        if (ids.length) {
          const { data: profs } = await supabase.from("profiles").select("id, full_name, role").in("id", ids);
          const map: Record<string, Profile> = {};
          (profs || []).forEach((p: any) => (map[p.id] = p));
          setProfiles(map);
        } else {
          setProfiles({});
        }

        // Optional user filter (by substring of name)
        const filtered =
          userLike.trim().length === 0
            ? list
            : list.filter((r) => {
                const p = r.user_id ? profiles[r.user_id] : undefined;
                const name = p?.full_name || r.user_id || "";
                return name.toLowerCase().includes(userLike.toLowerCase());
              });

        setRows(filtered);
      } catch (e: any) {
        setError(e?.message || "Failed to load");
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc, from, to, userLike]);

  function exportCSV() {
    const head = [
      "id",
      "date",
      "location",
      "action",
      "checked_count",
      "notes_len",
      "checked_ids",
      "user",
      "client_ts",
      "inserted_at",
    ];
    const body = rows.map((r) => {
      const profile = r.user_id ? profiles[r.user_id] : undefined;
      const who = profile?.full_name || r.user_id || "";
      return [
        r.id,
        r.date,
        r.location,
        r.action,
        r.checked_count,
        r.notes_len,
        (r.checked_ids || []).join(" | "),
        who,
        r.client_ts,
        r.inserted_at,
      ];
    });
    const csv =
      head.join(",") +
      "\n" +
      body
        .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily_ops_audit_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Daily Ops Audit</h1>
      <p className="text-sm text-gray-600">Filter and export the autosaved history of checklist completion.</p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-xs text-gray-600">Location</label>
          <select
            className="w-full border rounded-md px-3 py-2"
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
          >
            {locations.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-600">From</label>
          <input
            type="date"
            className="w-full border rounded-md px-3 py-2"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-600">To</label>
          <input
            type="date"
            className="w-full border rounded-md px-3 py-2"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-600">User (contains)</label>
          <input
            type="text"
            placeholder="Name or user id"
            className="w-full border rounded-md px-3 py-2"
            value={userLike}
            onChange={(e) => setUserLike(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {loading ? "Loading…" : `${rows.length} rows`}
          {error && <span className="text-red-600 ml-2">{error}</span>}
        </div>
        <button
          onClick={exportCSV}
          className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          disabled={loading || rows.length === 0}
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="text-left p-2 border-b">Date</th>
              <th className="text-left p-2 border-b">Location</th>
              <th className="text-left p-2 border-b">User</th>
              <th className="text-left p-2 border-b">Action</th>
              <th className="text-right p-2 border-b">Checked</th>
              <th className="text-right p-2 border-b">Notes len</th>
              <th className="text-left p-2 border-b">Checked IDs</th>
              <th className="text-left p-2 border-b">Saved At</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = r.user_id ? profiles[r.user_id] : undefined;
              const who = p?.full_name || r.user_id || "—";
              return (
                <tr key={r.id} className="odd:bg-white even:bg-gray-50">
                  <td className="p-2 border-b">{r.date}</td>
                  <td className="p-2 border-b">{r.location}</td>
                  <td className="p-2 border-b">{who}</td>
                  <td className="p-2 border-b">{r.action}</td>
                  <td className="p-2 border-b text-right">{r.checked_count}</td>
                  <td className="p-2 border-b text-right">{r.notes_len}</td>
                  <td className="p-2 border-b">{(r.checked_ids || []).join(", ")}</td>
                  <td className="p-2 border-b">
                    {new Date(r.inserted_at).toLocaleString("en-GB")}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-gray-500">
                  No results
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
