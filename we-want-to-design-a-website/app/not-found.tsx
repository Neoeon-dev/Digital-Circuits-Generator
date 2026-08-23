import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper p-6 text-ink">
      <section className="text-center">
        <p className="font-mono text-sm font-bold text-cyan">404</p>
        <h1 className="mt-2 text-3xl font-bold">Workspace not found.</h1>
        <p className="mt-3 text-sm text-slate-500">That route is not part of the LogicFlow studio.</p>
        <Link href="/workspace" className="mt-5 inline-flex rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white">Return to Studio</Link>
      </section>
    </main>
  );
}
