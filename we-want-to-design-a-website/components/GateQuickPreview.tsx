"use client";

import { useState } from "react";

function cn(...values: Array<string | false | null | undefined>) { return values.filter(Boolean).join(" "); }

export default function GateQuickPreview() {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const outputs = { AND: a & b, OR: a | b, XOR: a ^ b, NAND: Number(!(a & b)), NOR: Number(!(a | b)) };
  return (
    <div className="quick-lab color-card color-card-cyan rounded-3xl border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-cyan">Live sandbox</p><h3 className="mt-1 text-lg font-bold text-ink">Probe the classic gate families.</h3></div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600">LIVE · 2 INPUTS</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setA((v) => v ? 0 : 1)} className={cn("quick-input", !!a && "is-high")}><span>INPUT A</span><strong>{a}</strong></button>
        <button type="button" onClick={() => setB((v) => v ? 0 : 1)} className={cn("quick-input", !!b && "is-high")}><span>INPUT B</span><strong>{b}</strong></button>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {Object.entries(outputs).map(([name, value]) => <div key={name} className={cn("quick-gate", !!value && "is-high")}><span>{name}</span><strong>{value}</strong></div>)}
      </div>
    </div>
  );
}
