"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("LogicFlow runtime error", error); }, [error]);
  return (
    <main className="grid min-h-screen place-items-center bg-paper p-6 text-ink">
      <section className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-7 shadow-panel">
        <p className="text-xs font-black uppercase tracking-[.16em] text-red-500">Workspace error</p>
        <h1 className="mt-2 text-2xl font-bold">LogicFlow hit an unexpected error.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">The rest of the site can remain intact. Retry the current workspace, or return to the studio.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => reset()} className="rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white">Retry</button>
          <a href="/workspace" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-ink">Back to Studio</a>
        </div>
      </section>
    </main>
  );
}
