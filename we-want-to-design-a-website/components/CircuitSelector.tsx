"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIES, CIRCUITS } from "./friendEngine";

export default function CircuitSelector({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = CIRCUITS[value] ?? CIRCUITS[Object.keys(CIRCUITS)[0]];

  useEffect(() => {
    const handle = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const groups = Object.entries(CATEGORIES).map(([key, group]) => ({
    key,
    title: group.title,
    circuits: group.circuits.filter((id) => CIRCUITS[id].title.toLowerCase().includes(query.toLowerCase())),
  })).filter((group) => group.circuits.length > 0);

  return (
    <div ref={rootRef} className="relative mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if ((event.key === "ArrowDown" || event.key === "Enter") && !open) { event.preventDefault(); setOpen(true); } }} className={"circuit-select-trigger" + (open ? " is-open" : "")} aria-haspopup="listbox" aria-expanded={open} aria-controls="logicflow-circuit-list">
        <div className="min-w-0 text-left"><span className="block text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Selected circuit</span><span className="mt-1 block truncate text-sm font-bold text-ink">{selected.title}</span></div>
        <span className={open ? "rotate-180 transition-transform" : "transition-transform"}>⌄</span>
      </button>
      {open && <div id="logicflow-circuit-list" className="circuit-select-popover z-30" role="listbox" aria-label="Circuit library">
        <div className="border-b border-slate-200 p-3"><input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus placeholder="Search 18 circuits…" className="circuit-select-search" /></div>
        <div className="max-h-[430px] overflow-auto p-2">
          {groups.map((group) => <div key={group.key} className="mb-2"><p className="circuit-group-label">{group.title}</p>{group.circuits.map((id) => { const item = CIRCUITS[id]; const active = id === value; return <button key={id} type="button" role="option" aria-selected={active} onClick={() => { onChange(id); setOpen(false); setQuery(""); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} className={"circuit-option" + (active ? " is-active" : "")}><span className="circuit-option-title">{item.title}</span><span className="circuit-option-description">{item.description}</span></button>; })}</div>)}
        </div>
      </div>}
    </div>
  );
}
