"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel, Tag } from "./Studio";
import { Waveform } from "./Solver";

const SEGMENTS = ["a","b","c","d","e","f","g"] as const;
const PATTERNS: Record<number, Record<string, number>> = {
  0:{a:1,b:1,c:1,d:1,e:1,f:1,g:0},1:{a:0,b:1,c:1,d:0,e:0,f:0,g:0},2:{a:1,b:1,c:0,d:1,e:1,f:0,g:1},3:{a:1,b:1,c:1,d:1,e:0,f:0,g:1},4:{a:0,b:1,c:1,d:0,e:0,f:1,g:1},5:{a:1,b:0,c:1,d:1,e:0,f:1,g:1},6:{a:1,b:0,c:1,d:1,e:1,f:1,g:1},7:{a:1,b:1,c:1,d:0,e:0,f:0,g:0},8:{a:1,b:1,c:1,d:1,e:1,f:1,g:1},9:{a:1,b:1,c:1,d:1,e:0,f:1,g:1},10:{a:1,b:1,c:1,d:0,e:1,f:1,g:1},11:{a:0,b:0,c:1,d:1,e:1,f:1,g:1},12:{a:1,b:0,c:0,d:1,e:1,f:1,g:0},13:{a:0,b:1,c:1,d:1,e:1,f:0,g:1},14:{a:1,b:0,c:0,d:1,e:1,f:1,g:1},15:{a:1,b:0,c:0,d:0,e:1,f:1,g:1}
};
const CHARS=["0","1","2","3","4","5","6","7","8","9","A","b","C","d","E","F"];
const COLORS=[
  {name:"Ruby",hex:"#ff3b5c"},{name:"Emerald",hex:"#19d792"},{name:"Cyan",hex:"#00d9ff"},{name:"Amber",hex:"#ffb000"},{name:"Violet",hex:"#9f72ff"},{name:"Ice",hex:"#eaf7ff"}
];

function SevenDisplay({ pattern, anode, color, onToggle }: { pattern: Record<string,number>; anode:boolean; color:string; onToggle:(s:string)=>void }) {
  const paths: Record<string,string>={a:"M45 18H155",b:"M163 25V84",c:"M163 101V160",d:"M45 168H155",e:"M37 101V160",f:"M37 25V84",g:"M45 93H155"};
  return <svg viewBox="0 0 200 188" className="w-full max-w-[330px] overflow-visible">{SEGMENTS.map(s=>{const on=anode?pattern[s]===0:pattern[s]===1;return <g key={s} onClick={()=>onToggle(s)} className="cursor-pointer"><path d={paths[s]} stroke="#172235" strokeWidth="17" strokeLinecap="round" fill="none"/><path d={paths[s]} stroke={on?color:"#25344b"} strokeWidth="12" strokeLinecap="round" fill="none" style={{filter:on?`drop-shadow(0 0 11px ${color})`:undefined,transition:"all .18s"}}/><text x={s==="a"||s==="d"||s==="g"?100:s==="b"||s==="c"?181:18} y={s==="a"?9:s==="d"?184:s==="g"?84:100} textAnchor="middle" fill="#6b7b91" fontSize="8">{s}</text></g>})}<circle cx="180" cy="168" r="6" fill="#26364b"/></svg>;
}

export function SevenSegmentWorkspace({ sound, dark }: { sound: { click:(high?:boolean)=>void }; dark:boolean }) {
  const [hex,setHex]=useState(false),[anode,setAnode]=useState(false),[value,setValue]=useState(8),[color,setColor]=useState(COLORS[0].hex),[running,setRunning]=useState(false),[period,setPeriod]=useState(800),[history,setHistory]=useState<number[]>([8]),[custom,setCustom]=useState<Record<string,number>|null>(null);
  const pattern=custom ?? PATTERNS[value];
  const decoded=useMemo(()=>{
    const target=pattern;
    const max=hex?16:10;
    for(let i=0;i<max;i++){const p=PATTERNS[i];if(SEGMENTS.every(s=>(anode?1-p[s]:p[s])===(anode?target[s]:target[s])))return `${CHARS[i]} · ${i.toString(2).padStart(4,"0")} · ${Object.entries(target).filter(([,v])=>v).map(([s])=>s).join(",")||"none"}`;}
    return `Custom glyph · ${SEGMENTS.filter(s=>target[s]).join(",")||"none"}`;
  },[anode,hex,pattern]);
  useEffect(()=>{if(!running)return;const timer=window.setInterval(()=>{setValue(v=>(v+1)%(hex?16:10));setCustom(null);setHistory(h=>[...h.slice(-23),(value+1)%(hex?16:10)]);sound.click(true)},period);return()=>window.clearInterval(timer)},[running,period,hex,sound,value]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;const idx=CHARS.findIndex(c=>c.toLowerCase()===e.key.toLowerCase());if(idx>=0&&idx<(hex?16:10)){setValue(idx);setCustom(null);setHistory(h=>[...h.slice(-23),idx]);sound.click(true)}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[hex,sound]);
  const wave=Array.from({length:24},(_,i)=>SEGMENTS.map(s=>{const p=PATTERNS[history[Math.max(0,i%history.length)]??0];return anode?1-(p?.[s]??0):(p?.[s]??0)}));
  const toggleSeg=(s:string)=>{setCustom(prev=>({...((prev??PATTERNS[value])),[s]:((prev??PATTERNS[value])[s]^1)}));sound.click(true)};

  return <div className="mx-auto max-w-[1540px] px-4 pb-16 pt-8 lg:px-8">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><Tag tone="amber">7-segment hardware lab</Tag><h2 className="mt-4 text-3xl font-black lf-text">Decode, drive, probe, repeat.</h2><p className="mt-2 max-w-2xl text-sm leading-6 lf-muted">BCD and hexadecimal decoding with polarity, phosphor, reverse glyph decoding and a real timing analyzer.</p></div><span className="rounded-full bg-cyan-300/10 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-300">{hex?"HEX 0–F":"BCD 0–9"}</span></div>
    <div className="grid gap-6 xl:grid-cols-[.75fr_1.25fr]">
      <Panel tone="amber" className="p-5 lg:p-7">
        <Tag tone="amber">Decoder controls</Tag>
        <div className="mt-5 grid grid-cols-2 gap-2"><button onClick={()=>{setHex(false);setValue(Math.min(value,9));setCustom(null);sound.click(true)}} className={`rounded-xl border px-4 py-3 text-xs font-black ${!hex?"border-amber-400/30 bg-amber-400/10 text-amber-300":"lf-border lf-surface-2 lf-muted"}`}>BCD 0–9</button><button onClick={()=>{setHex(true);setCustom(null);sound.click(true)}} className={`rounded-xl border px-4 py-3 text-xs font-black ${hex?"border-violet-400/30 bg-violet-400/10 text-violet-300":"lf-border lf-surface-2 lf-muted"}`}>HEX 0–F</button></div>
        <div className="mt-5 grid grid-cols-2 gap-2"><button onClick={()=>setAnode(false)} className={`rounded-xl border px-4 py-3 text-xs font-black ${!anode?"border-emerald-400/30 bg-emerald-400/10 text-emerald-300":"lf-border lf-surface-2 lf-muted"}`}>Common cathode</button><button onClick={()=>setAnode(true)} className={`rounded-xl border px-4 py-3 text-xs font-black ${anode?"border-pink-400/30 bg-pink-400/10 text-pink-300":"lf-border lf-surface-2 lf-muted"}`}>Common anode</button></div>
        <div className="mt-6"><div className="text-[10px] font-black uppercase tracking-wider lf-muted">LED phosphor</div><div className="mt-3 grid grid-cols-3 gap-2">{COLORS.map(c=><button key={c.name} title={c.name} onClick={()=>setColor(c.hex)} className={`h-10 rounded-xl border ${color===c.hex?"border-[var(--lf-text)]":"lf-border"}`} style={{background:`radial-gradient(circle at 50% 45%, ${c.hex}, transparent 70%)`}} />)}</div></div>
        <div className="mt-6 rounded-2xl border lf-border lf-surface-2 p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-wider lf-muted">Clock interval</span><span className="font-mono text-xs text-cyan-300">{period} ms</span></div><input type="range" min="200" max="2000" step="100" value={period} onChange={e=>setPeriod(Number(e.target.value))} className="mt-4 w-full"/><div className="mt-4 grid grid-cols-4 gap-2"><button onClick={()=>setRunning(v=>!v)} className={`rounded-xl px-3 py-3 text-[10px] font-black ${running?"bg-emerald-400/10 text-emerald-300":"lf-surface border lf-border lf-text"}`}>{running?"Ⅱ Pause":"▶ Start"}</button><button onClick={()=>{setValue(v=>(v+1)%(hex?16:10));setCustom(null);sound.click(true)}} className="rounded-xl border lf-border lf-surface px-3 py-3 text-[10px] font-black lf-text">Step +1</button><button onClick={()=>{setValue(v=>(v+16-1)%(hex?16:10));setCustom(null);sound.click(false)}} className="rounded-xl border lf-border lf-surface px-3 py-3 text-[10px] font-black lf-text">Step −1</button><button onClick={()=>{setValue(0);setCustom(null);setHistory([0]);setRunning(false)}} className="rounded-xl border lf-border lf-surface px-3 py-3 text-[10px] font-black lf-text">Reset</button></div></div>
        <div className="mt-5 text-[10px] leading-5 lf-muted">Keyboard: 0–9{hex?" / A–F":""}. Click any segment directly to create and reverse-decode a custom glyph.</div>
      </Panel>
      <Panel tone="cyan" className="p-5 lg:p-7">
        <div className="grid gap-6 xl:grid-cols-[.82fr_1.18fr] xl:items-center"><div className="grid place-items-center rounded-[30px] border lf-border bg-[#07101a] p-7 shadow-inner"><SevenDisplay pattern={pattern} anode={anode} color={color} onToggle={toggleSeg}/></div><div><Tag>Reverse decoding</Tag><div className="mt-4 font-mono text-6xl font-black lf-text">{custom?"CUSTOM":CHARS[value]}<span className="ml-3 text-cyan-300">·</span></div><div className="mt-2 font-mono text-xs leading-6 lf-muted">{decoded}</div><div className="mt-6 grid grid-cols-3 gap-2">{SEGMENTS.map(s=><div key={s} className="rounded-xl border lf-border lf-surface-2 p-3 text-center"><div className="text-[9px] font-black uppercase tracking-wider lf-muted">seg {s}</div><div className={`mt-1 font-mono text-xl font-black ${pattern[s] ? "text-emerald-400" : "lf-muted"}`}>{pattern[s]}</div></div>)}</div></div></div>
        <div className="mt-7"><Waveform values={wave} labels={SEGMENTS.map(s=>`seg ${s}`)} color={color} title="7-segment digital logic analyzer"/></div>
      </Panel>
    </div>
  </div>;
}
