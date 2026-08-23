export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper p-6 text-ink">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-center shadow-panel">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-cyan" aria-hidden="true" />
        <p className="mt-4 text-sm font-bold">Loading LogicFlow…</p>
      </div>
    </main>
  );
}
