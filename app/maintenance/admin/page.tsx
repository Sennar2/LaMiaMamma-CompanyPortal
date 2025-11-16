'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

type Area = { id: number; name: string };
type Item = { id: number; area_id: number; name: string };
type Profile = { role: 'user'|'ops'|'admin' };

export default function MaintenanceAdminPage() {
  const [profile, setProfile] = useState<Profile|null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [newArea, setNewArea] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemArea, setNewItemArea] = useState<number|''>('');

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;

      const { data: p } = await supabase.from('profiles').select('role').eq('id', u.user.id).single();
      setProfile(p as Profile);

      const [{ data: a }, { data: it }] = await Promise.all([
        supabase.from('areas').select('id,name').order('name'),
        supabase.from('items').select('id,area_id,name').order('name'),
      ]);
      setAreas(a || []);
      setItems(it || []);
    })();
  }, []);

  if (profile && profile.role === 'user') {
    return (
      <main className="p-6 max-w-4xl mx-auto">
        <div className="rounded-2xl border bg-white p-4">Access restricted.</div>
      </main>
    );
  }

  async function addArea() {
    const name = newArea.trim();
    if (!name) return;
    const { data } = await supabase.from('areas').insert({ name }).select('id,name').single();
    if (data) setAreas(prev => [...prev, data]);
    setNewArea('');
  }
  async function deleteArea(id: number) {
    await supabase.from('areas').delete().eq('id', id);
    setAreas(prev => prev.filter(a => a.id !== id));
    setItems(prev => prev.filter(i => i.area_id !== id));
  }

  async function addItem() {
    const name = newItemName.trim();
    if (!name || !newItemArea) return;
    const { data } = await supabase.from('items').insert({ name, area_id: Number(newItemArea) }).select('id,area_id,name').single();
    if (data) setItems(prev => [...prev, data]);
    setNewItemName(''); setNewItemArea('');
  }
  async function deleteItem(id: number) {
    await supabase.from('items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Maintenance Admin</h1>
        <Link href="/maintenance" className="btn">Back</Link>
      </div>

      {/* Areas */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium">Areas</div>
          <div className="flex gap-2">
            <input className="input" placeholder="New area name" value={newArea} onChange={(e)=>setNewArea(e.target.value)} />
            <button className="btn btn-primary" onClick={addArea}>Add area</button>
          </div>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {areas.map(a => (
            <li key={a.id} className="rounded-xl border p-3 flex items-center justify-between">
              <div className="font-medium">{a.name}</div>
              <button className="text-sm text-red-600" onClick={()=>deleteArea(a.id)}>Delete</button>
            </li>
          ))}
        </ul>
      </div>

      {/* Items */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium">Items</div>
          <div className="flex gap-2">
            <select className="select" value={newItemArea as any} onChange={(e)=>setNewItemArea(Number(e.target.value) as any)}>
              <option value="">Area…</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input className="input" placeholder="New item name" value={newItemName} onChange={(e)=>setNewItemName(e.target.value)} />
            <button className="btn btn-primary" onClick={addItem}>Add item</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {items.map(i => (
            <div key={i.id} className="rounded-xl border p-3 flex items-center justify-between">
              <div>{i.name} <span className="text-xs text-gray-500">in {areas.find(a=>a.id===i.area_id)?.name || '—'}</span></div>
              <button className="text-sm text-red-600" onClick={()=>deleteItem(i.id)}>Delete</button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
