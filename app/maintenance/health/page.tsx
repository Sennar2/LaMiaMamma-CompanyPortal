'use client';

import { useEffect, useState } from 'react';

const FN_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify-maintenance`;
const APPS = process.env.NEXT_PUBLIC_APPS_SCRIPT_WEBHOOK || '';

export default function HealthPage() {
  const [fn, setFn] = useState<any>(null);
  const [apps, setApps] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(FN_URL); // GET returns env flags
        setFn({ ok: r.ok, status: r.status, json: await r.json().catch(()=>null) });
      } catch (e) {
        setFn({ ok:false, error: String(e) });
      }
      try {
        if (APPS) {
          const r2 = await fetch(APPS);
          const t = await r2.text();
          setApps({ ok: r2.ok, status: r2.status, body: t.slice(0,300) });
        } else {
          setApps({ ok:false, error:'NEXT_PUBLIC_APPS_SCRIPT_WEBHOOK missing' });
        }
      } catch (e) {
        setApps({ ok:false, error: String(e) });
      }
    })();
  }, []);

  const Card = ({title, body}:{title:string, body:any}) => (
    <div className="rounded-2xl border bg-white p-4">
      <div className="font-medium mb-2">{title}</div>
      <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-x-auto">{JSON.stringify(body, null, 2)}</pre>
    </div>
  );

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Maintenance Health</h1>
      <Card title="Edge Function: notify-maintenance (GET)" body={fn} />
      <Card title="Apps Script (GET)" body={apps} />
    </main>
  );
}
