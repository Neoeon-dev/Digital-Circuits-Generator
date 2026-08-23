export type Workspace = "studio" | "solver" | "circuits" | "display" | "docs";
export type InputKind = "Statement" | "Boolean expression" | "Truth table" | "Minterms / Maxterms";
export type GateMode = "AND, OR & NOT" | "NAND only" | "NOR only";

export type LogicResponse = {
  problem?: string;
  input_type?: string;
  input?: Record<string, unknown>;
  ai?: { inputs: string[]; outputs: string[]; expression: string; explanation: string };
  logic: {
    expression: string;
    variables: string[];
    variable_count: number;
    truth_table: Record<string, number>[];
    minterms: number[];
    maxterms: number[];
    dont_care_terms: number[];
    canonical_sop: string;
    canonical_pos: string;
    simplified_sop: string;
    simplified_pos: string;
    implementation: { gates: string; fan_in: number; gate_count: number; realized_as: string };
    circuit: {
      nodes: { id: string; type: string; inputs?: string[] }[];
      edges: { source: string; target: string }[];
      output: string;
      image: string | null;
      constant_value: number | null;
    };
    verified: boolean;
  };
};

export type Theme = "dark" | "light";
export type Tone = "cyan" | "violet" | "pink" | "amber" | "emerald" | "blue";
