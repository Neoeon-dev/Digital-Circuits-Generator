"use client";

import type { CSSProperties } from "react";
import { buildKMap, type Implicant, type TruthRow, patternToSOPTerm } from "./logicAlgorithms";

const GROUPS = ["#F04E98", "#08B8D0", "#8A5CF6", "#F59E0B", "#10B981", "#3B82F6"];

export default function KMap({ variables, rows, implicants }: { variables: string[]; rows: TruthRow[]; implicants: Implicant[] }) {
  const map = buildKMap(variables, rows, implicants);
  if (!map) return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">K-maps are shown for 2–4 variables.</div>;

  const highlighted = new Map<number, number[]>();
  implicants.forEach((imp, i) => {
    for (const cellRow of map.cells) for (const cell of cellRow) {
      const bits = cell.minterm.toString(2).padStart(variables.length, "0");
      const covered = imp.pattern.split("").every((bit, j) => bit === "-" || bit === bits[j]);
      if (covered) highlighted.set(cell.minterm, [...(highlighted.get(cell.minterm) ?? []), i]);
    }
  });

  return (
    <div className="kmap-wrap">
      <div className="kmap-explainer">
        <span><b>1</b> = ON</span>
        <span><b>X</b> = don't care</span>
        <span><i className="kmap-dot" /> colored rings = implicant groups</span>
      </div>
      <div className="kmap-table-wrap">
        <table className="kmap-table">
          <thead><tr><th>{variables.slice(0, variables.length === 4 ? 2 : 1).join("")} \ {variables.slice(variables.length === 4 ? 2 : 1).join("")}</th>{map.cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{map.cells.map((line, ri) => <tr key={ri}><th>{map.rows[ri]}</th>{line.map(cell => {
            const groups = highlighted.get(cell.minterm) ?? [];
            const primary = groups[0] !== undefined ? GROUPS[groups[0] % GROUPS.length] : undefined;
            const style: CSSProperties = primary ? { "--group": primary, boxShadow: groups.length > 1 ? `inset 0 0 0 2px ${GROUPS[groups[1] % GROUPS.length]}, inset 0 0 0 5px transparent` : undefined } as CSSProperties : {};
            return <td key={cell.minterm} style={style} className={cell.value === 1 ? "is-one" : cell.value === "X" ? "is-x" : "is-zero"}>
              <span className="kmap-minterm">m{cell.minterm}</span>
              <strong>{cell.value}</strong>
              {groups.length > 0 && <span className="kmap-group-dots">{groups.slice(0, 4).map(g => <i key={g} style={{ background: GROUPS[g % GROUPS.length] }} />)}</span>}
            </td>;
          })}</tr>)}</tbody>
        </table>
      </div>
      <div className="kmap-legend">
        {implicants.map((imp, i) => <span key={`${imp.pattern}-${i}`} className="kmap-chip" style={{ borderColor: GROUPS[i % GROUPS.length], background: `${GROUPS[i % GROUPS.length]}14` }}><i style={{ background: GROUPS[i % GROUPS.length] }} />{patternToSOPTerm(imp.pattern, variables)}</span>)}
      </div>
    </div>
  );
}
