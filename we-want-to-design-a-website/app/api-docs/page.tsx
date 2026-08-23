"use client";

import { useEffect, useState } from "react";
import StudioShell from "../../components/StudioShell";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "https://digital-circuits-generator-3.onrender.com").replace(/\/+$/, "");
const routes = [
  ["POST", "/api/logic/generate", "Natural-language logic statement"],
  ["POST", "/api/logic/expression", "Boolean expression"],
  ["POST", "/api/logic/truth-table", "Truth table input"],
  ["POST", "/api/logic/minterms", "Σm(...) synthesis"],
  ["POST", "/api/logic/maxterms", "ΠM(...) synthesis"],
  ["POST", "/api/logic/dummy", "Pipeline smoke test"],
];

export default function ApiDocsPage() {
  const [openapi, setOpenapi] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    fetch(`${API_BASE_URL}/openapi.json`, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then(setOpenapi)
      .catch((e) => { if (e?.name === "AbortError") setError("OpenAPI request timed out."); else setError(e instanceof Error ? e.message : "Could not load the OpenAPI document."); })
      .finally(() => window.clearTimeout(timer));
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, []);
  return <StudioShell><section className="mx-auto max-w-7xl px-6 pb-16 pt-8 lg:px-8"><div className="mb-7 max-w-3xl"><p className="text-sm font-bold text-cyan">05 / API SURFACE</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">See the backend contract without leaving LogicFlow.</h1><p className="mt-3 text-base leading-7 text-slate-600">The frontend keeps one source of truth for the API base URL and can inspect the deployed OpenAPI document when the backend is reachable.</p></div><div className="grid gap-6 lg:grid-cols-[1fr_.95fr]"><div className="color-card color-card-cyan rounded-3xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-700">Confirmed route surface</p><p className="mt-1 text-xs text-slate-500">Routes already consumed by the React client.</p></div><a href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer" className="rounded-lg border border-cyan/30 bg-cyan/5 px-3 py-2 text-xs font-bold text-cyan">Open Swagger ↗</a></div><div className="mt-5 grid gap-2">{routes.map(([method, path, desc]) => <div key={path} className="api-route-row"><span>{method}</span><code>{path}</code><p>{desc}</p></div>)}</div></div><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-700">Live OpenAPI</p><p className="mt-1 text-xs text-slate-500">{openapi ? "Backend schema loaded" : error || "Checking backend…"}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-600">{openapi ? "CONNECTED" : "WAITING"}</span></div><pre className="mt-5 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-4 text-[10px] leading-5 text-cyan-100">{openapi ? JSON.stringify(openapi, null, 2) : error || "fetching /openapi.json …"}</pre></div></div></section></StudioShell>;
}
