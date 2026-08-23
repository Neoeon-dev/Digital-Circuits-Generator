"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import GateQuickPreview from "../../components/GateQuickPreview";
import StudioShell from "../../components/StudioShell";

export default function WorkspacePage() {
  return <StudioShell>
    <section className="relative mx-auto max-w-7xl px-6 pb-14 pt-8 lg:px-8 lg:pt-14">
      <div className="absolute right-[-8rem] top-[-3rem] h-80 w-80 rounded-full bg-mango/20 blur-3xl" />
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }} className="relative grid items-center gap-8 xl:grid-cols-[1.05fr_.95fr]">
        <div><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-pink/20 bg-pink/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[.16em] text-pink"><span className="h-1.5 w-1.5 rounded-full bg-pink"/>Interactive digital hardware studio</div><h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-ink sm:text-6xl">From Boolean logic<br/><span className="rainbow-title">to working circuits.</span></h1><p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">Keep Boolean synthesis, live probing, combinational circuits and display decoding in one visual workbench.</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/logic-solver" className="rounded-xl bg-gradient-to-r from-coral via-pink to-violet px-5 py-3 text-sm font-bold text-white shadow-lg shadow-pink/20 transition hover:-translate-y-0.5">Open logic workspace →</Link><Link href="/circuit-lab" className="rounded-xl border border-slate-200 bg-white/75 px-5 py-3 text-sm font-bold text-ink transition hover:border-mango">Explore 18 circuits</Link></div></div>
        <GateQuickPreview />
      </motion.div>
    </section>

    <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-8"><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {[
        ["Σ", "Logic Synthesis", "Truth tables · K-maps · probes", "/logic-solver", "cyan"],
        ["▦", "Circuit Lab", "18 combinational building blocks", "/circuit-lab", "mango"],
        ["8", "8-Segment", "BCD · HEX · analyzer · counter", "/seven-segment", "pink"],
      ].map(([icon, title, desc, href, tone]) => <Link key={href} href={href} className={`studio-feature-card ${tone}`}><span className="studio-feature-icon">{icon}</span><h2>{title}</h2><p>{desc}</p><span>Open workspace →</span></Link>)}
    </div></section>
  </StudioShell>;
}
