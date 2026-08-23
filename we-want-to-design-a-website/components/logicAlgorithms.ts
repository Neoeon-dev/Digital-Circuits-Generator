export type TruthRow = { inputs: number[]; output: number };
export type Implicant = { pattern: string };

function canCombine(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      diff++;
      if (diff > 1) return false;
    }
  }
  return diff === 1;
}

function combinePatterns(a: string, b: string): string {
  let result = "";
  for (let i = 0; i < a.length; i++) result += a[i] === b[i] ? a[i] : "-";
  return result;
}

function covers(pattern: string, minterm: number, variableCount: number): boolean {
  const bits = minterm.toString(2).padStart(variableCount, "0");
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] !== "-" && pattern[i] !== bits[i]) return false;
  }
  return true;
}

function primeImplicants(minterms: number[], variableCount: number): Implicant[] {
  let groups = new Map<number, Set<string>>();
  for (const m of minterms) {
    const bits = m.toString(2).padStart(variableCount, "0");
    const ones = (bits.match(/1/g) || []).length;
    if (!groups.has(ones)) groups.set(ones, new Set());
    groups.get(ones)!.add(bits);
  }

  const primes = new Set<string>();
  while (groups.size) {
    const next = new Map<number, Set<string>>();
    const combined = new Set<string>();
    const keys = [...groups.keys()].sort((a, b) => a - b);

    for (let i = 0; i < keys.length - 1; i++) {
      const a = groups.get(keys[i])!;
      const b = groups.get(keys[i + 1])!;
      for (const p of a) {
        for (const q of b) {
          if (!canCombine(p, q)) continue;
          combined.add(p); combined.add(q);
          const merged = combinePatterns(p, q);
          const ones = (merged.replace(/-/g, "").match(/1/g) || []).length;
          if (!next.has(ones)) next.set(ones, new Set());
          next.get(ones)!.add(merged);
        }
      }
    }

    for (const set of groups.values()) {
      for (const p of set) if (!combined.has(p)) primes.add(p);
    }
    groups = next;
  }
  return [...primes].map(pattern => ({ pattern }));
}

function minimumCover(minterms: number[], primes: Implicant[], variableCount: number): Implicant[] {
  if (!minterms.length || !primes.length) return [];
  const chart = primes.map(p => minterms.map(m => covers(p.pattern, m, variableCount)));
  const essential = new Set<number>();
  const uncovered = new Set<number>(minterms.map((_, i) => i));

  for (let c = 0; c < minterms.length; c++) {
    const options: number[] = [];
    for (let r = 0; r < primes.length; r++) if (chart[r][c]) options.push(r);
    if (options.length === 1) {
      const r = options[0];
      essential.add(r);
      for (let col = 0; col < minterms.length; col++) if (chart[r][col]) uncovered.delete(col);
    }
  }
  if (!uncovered.size) return [...essential].map(i => primes[i]);

  const remaining = primes.map((_, i) => i).filter(i => !essential.has(i));
  const target = [...uncovered];
  let best: number[] | null = null;

  const search = (left: number[], chosen: number[]) => {
    if (!left.length) {
      if (!best || chosen.length < best.length) best = chosen;
      return;
    }
    if (best && chosen.length >= best.length) return;
    const first = left[0];
    for (const idx of remaining) {
      if (chosen.includes(idx) || !chart[idx][first]) continue;
      search(left.filter(col => !chart[idx][col]), [...chosen, idx]);
    }
  };
  search(target, []);
  const chosen = new Set([...essential, ...(best || [])]);
  return [...chosen].map(i => primes[i]);
}

export function minimizeSOP(minterms: number[], variables: string[], dontCares: number[] = []): { expression: string; implicants: Implicant[] } {
  if (!minterms.length) return { expression: "0", implicants: [] };
  if (minterms.length + dontCares.length === (1 << variables.length)) {
    return { expression: "1", implicants: [{ pattern: "-".repeat(variables.length) }] };
  }
  const all = [...new Set([...minterms, ...dontCares])];
  const cover = minimumCover(minterms, primeImplicants(all, variables.length), variables.length);
  return { expression: cover.length ? cover.map(p => patternToSOPTerm(p.pattern, variables)).join(" + ") : "0", implicants: cover };
}

export function patternToSOPTerm(pattern: string, variables: string[]): string {
  let term = "";
  pattern.split("").forEach((bit, i) => {
    if (bit === "1") term += variables[i];
    else if (bit === "0") term += `${variables[i]}'`;
  });
  return term || "1";
}

export function grayCode(n: number): number[] {
  return Array.from({ length: 1 << n }, (_, i) => i ^ (i >> 1));
}

export type KMapCell = { minterm: number; value: 0 | 1 | "X"; group: number };

export function buildKMap(variables: string[], rows: TruthRow[], implicants: Implicant[]): { rows: string[]; cols: string[]; cells: KMapCell[][] } | null {
  const count = variables.length;
  if (count < 2 || count > 4) return null;
  const rowBits = count === 4 ? 2 : 1;
  const colBits = count === 2 ? 1 : count === 3 ? 2 : 2;
  const rowGray = grayCode(rowBits);
  const colGray = grayCode(colBits);
  const rowLabels = rowGray.map(v => v.toString(2).padStart(rowBits, "0"));
  const colLabels = colGray.map(v => v.toString(2).padStart(colBits, "0"));
  const rowValues = rowGray.map(rowValue => {
    return colGray.map(colValue => {
      let minterm = 0;
      for (let b = 0; b < rowBits; b++) if (rowValue & (1 << (rowBits - 1 - b))) minterm |= 1 << (count - 1 - b);
      for (let b = 0; b < colBits; b++) if (colValue & (1 << (colBits - 1 - b))) minterm |= 1 << (count - 1 - rowBits - b);
      const resolvedRow = rows[minterm];
      const value: 0 | 1 | "X" = resolvedRow?.output === 1 ? 1 : resolvedRow?.output === -1 ? "X" : 0;
      const group = implicants.findIndex(imp => {
        const bits = minterm.toString(2).padStart(count, "0");
        return imp.pattern.split("").every((p, i) => p === "-" || p === bits[i]);
      });
      return { minterm, value, group };
    });
  });
  return { rows: rowLabels, cols: colLabels, cells: rowValues };
}

export function historyForTruthTable(variables: string[], truthRows: TruthRow[]) {
  return truthRows.map(row => ({ label: variables.map((v, i) => `${v}=${row.inputs[i]}`).join(" "), value: row.output }));
}
