"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CATEGORIES, CIRCUITS, type CircuitDefinition } from "./friendEngine";
import SignalGraph from "./SignalGraph";
import ImplementationPanel from "./ImplementationPanel";
import CircuitSelector from "./CircuitSelector";

type Sample = { label: string; value: number };

export default function CircuitLab({ onSound }: { onSound?: (high?: boolean) => void }) {
  const first = CATEGORIES.adders.circuits[0];
  const [selected, setSelected] = useState(first);
  const [inputs, setInputs] = useState<Record<string, number>>({ A:0, B:0, Cin:0, Bin:0, Din:0 });
  const [history, setHistory] = useState<Sample[]>([]);
  const [stage, setStage] = useState(-1);
  const safeSelected = CIRCUITS[selected] ? selected : first;
  const circuit = CIRCUITS[safeSelected] as CircuitDefinition;
  const output = useMemo(() => circuit.evaluate(inputs), [circuit, inputs]);
  const allInputs = circuit.inputs;
  const graphPoints = history.length ? history : [{ label: "0", value: Number(Object.values(output)[0] || 0) }];

  const choose = (id: string) => {
    if (!CIRCUITS[id]) return;
    setSelected(id); setStage(-1);
    const def = CIRCUITS[id];
    const next: Record<string, number> = {};
    def.inputs.forEach((k: string) => { next[k] = inputs[k] === 1 ? 1 : 0; });
    setInputs(next);
    setHistory([]);
  };
  const toggle = (name: string) => {
    const next = { ...inputs, [name]: inputs[name] ? 0 : 1 };
    setInputs(next); onSound?.(!!next[name]);
    const firstOut = Number(Object.values(circuit.evaluate(next))[0] || 0);
    setHistory(h => [...h.slice(-23), { label: `${name}=${next[name]}`, value: firstOut }]);
  };

  const schematic = circuit.renderSchematic(inputs, output, stage);
  const grouped = Object.entries(CATEGORIES);
  return <section id="circuits" className="mx-auto max-w-7xl px-6 pb-20 lg:px-8">
    <div className="mb-7 max-w-3xl"><p className="text-sm font-bold text-cyan">04 / INTERACTIVE CIRCUITS</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">Explore the same building blocks your digital logic needs.</h2><p className="mt-3 text-slate-600">The circuit repository stays compact until you choose a block. Then the simulator opens the schematic, live signals, Boolean implementation and timing history.</p></div>
    <div className="grid gap-6 xl:grid-cols-[.82fr_1.18fr]">
      <div className="color-card color-card-mango rounded-3xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7">
        <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-700">Circuit library</p><p className="mt-1 text-xs text-slate-500">18 reference circuits</p></div><span className="rounded-full bg-cyan/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-cyan">Select one</span></div>
        <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-slate-500">Choose a circuit</label>
        <CircuitSelector value={safeSelected} onChange={choose} />
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Category</p><p className="mt-1 text-sm font-bold text-ink">{grouped.find(([, group]) => group.circuits.includes(safeSelected))?.[1].title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{circuit.description}</p></div>
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-700">Why it is here</p><div className="mt-3 grid gap-2 text-xs text-slate-500"><p><span className="font-bold text-cyan">01</span> Live binary input switches</p><p><span className="font-bold text-violet">02</span> Animated HIGH/LOW propagation</p><p><span className="font-bold text-amber">03</span> Boolean + Verilog implementation</p><p><span className="font-bold text-emerald-600">04</span> Output timing history</p></div></div>
      </div>

      <motion.div layout className="circuit-simulator-panel rounded-3xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold text-cyan">SIMULATOR</p><h3 className="mt-1 text-2xl font-bold text-ink">{circuit.title}</h3><p className="mt-2 max-w-2xl text-sm text-slate-500">{circuit.description}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600">Live output</span></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{allInputs.map(name => <button key={name} onClick={() => toggle(name)} className={`rounded-xl border p-3 text-left transition ${inputs[name] ? "border-emerald-400/60 bg-emerald-50 shadow-[0_0_30px_rgba(16,185,129,.10)]" : "border-slate-200 bg-slate-50 hover:border-cyan/40"}`}><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500">INPUT {name}</span><span className={`font-mono text-xl font-black ${inputs[name] ? "text-emerald-600" : "text-slate-500"}`}>{inputs[name] || 0}</span></div><div className={`mt-2 h-1 rounded-full ${inputs[name] ? "bg-emerald-400" : "bg-slate-200"}`} /></button>)}</div>
        {circuit.id.includes("ripple") || circuit.id.includes("subtractor_4bit") ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="flex items-center justify-between text-xs"><span className="font-bold text-amber-700">Propagation stage</span><span className="font-mono text-amber-700">{stage < 0 ? "ALL" : `BIT ${stage+1}`}</span></div><input type="range" min={-1} max={3} value={stage} onChange={e => setStage(Number(e.target.value))} className="mt-2 w-full accent-amber-500" /></div> : null}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="circuit-engine-wrap routed-circuit-stage" dangerouslySetInnerHTML={{ __html: schematic }} /></div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{circuit.outputs.map(name => <div key={name} className={`rounded-2xl border p-4 ${output[name] ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{name}</p><p className={`mt-2 font-mono text-3xl font-black ${output[name] ? "text-emerald-600" : "text-slate-500"}`}>{output[name] || 0}</p></div>)}</div>
        <div className="mt-5"><ImplementationPanel expression={circuit.expressions.map(e => `${e.output}: ${e.formula}`).join("  |  ")} gates={circuit.title} realizedAs="Reference circuit definition" compact /></div>
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3"><SignalGraph title="Output timing" points={graphPoints} accent="#10b981" /></div>
      </motion.div>
    </div>
  </section>;
}
