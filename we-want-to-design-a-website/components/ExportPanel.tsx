"use client";

import type { LogicResponse } from "./LogicSolver";

function download(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExportPanel({ result, rows }: { result: LogicResponse; rows: { inputs: number[]; output: number }[] }) {
  const expression = result.logic.simplified_sop;
  const verilog = `module bool_function (\n    input wire ${result.logic.variables.join(", ")},\n    output wire F\n);\n    assign F = ${expression.replace(/([A-Za-z])'/g, "~$1").replace(/\+/g, " | ").replace(/·/g, " & ")};\nendmodule`;
  const c = `bool evaluate_logic(${result.logic.variables.map((variable) => `bool ${variable}`).join(", ")}) {\n    return ${expression.replace(/([A-Za-z])'/g, "(!$1)").replace(/\+/g, " || ").replace(/·/g, " && ")};\n}`;
  const cpp = `bool evaluate_logic(${result.logic.variables.map((variable) => `bool ${variable}`).join(", ")}) {\n    return ${expression.replace(/([A-Za-z])'/g, "(!$1)").replace(/\+/g, " || ").replace(/·/g, " && ")};\n}`;
  const latex = `\\[ F = ${expression.replace(/([A-Za-z])'/g, "\\overline{$1}")} \\]`;
  const md = `| ${result.logic.variables.join(" | ")} | F |\n| ${result.logic.variables.map(() => "---").join(" | ")} | --- |\n${rows.map((row) => `| ${row.inputs.join(" | ")} | ${row.output} |`).join("\n")}`;
  const items = [
    ["Verilog HDL", "logicflow.v", verilog, "cyan"],
    ["C", "logicflow.c", c, "violet"],
    ["C++", "logicflow.cpp", cpp, "pink"],
    ["LaTeX", "logicflow.tex", latex, "amber"],
    ["Markdown", "truth-table.md", md, "emerald"],
  ] as const;
  return <div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2 rounded-2xl bg-ink p-4 text-white"><p className="text-xs font-bold uppercase tracking-wider text-cyan">Generated implementation</p><p className="mt-2 break-words font-mono text-lg">{expression}</p><p className="mt-2 text-xs text-slate-400">Use the downloads below in your reports, simulations or HDL workflow.</p></div>{items.map(([title, file, text, tone]) => <div key={title} className="export-card"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-slate-700">{title}</p><span className={`export-tone ${tone}`}>{file}</span></div><pre className="mt-3 max-h-44 overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] leading-5 text-cyan-100">{text}</pre><button type="button" onClick={() => download(file, text)} className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold text-white export-button ${tone}`}>Download</button></div>)}</div>;
}
