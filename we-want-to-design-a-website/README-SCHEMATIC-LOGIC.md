# Logic Solver schematic renderer fix

The Logic Solver diagram is now rendered by a gate-aware layout engine instead of a generic node/edge drawing pass.

Key changes:
- Gate-specific geometry for AND, OR, XOR, NAND, NOR, XNOR and NOT.
- Explicit target pin positions derived from `node.inputs` order.
- Explicit source/output pin positions derived from gate geometry.
- Separate orthogonal routing channels allocated per edge corridor.
- Barycentric vertical ordering of gates to reduce crossings.
- Input fan-out is routed from a single variable pin into separate channels.
- HIGH signals retain the existing animated dashed wire and travelling signal particle.
- Output wire originates from the gate's actual output-side geometry rather than a generic center offset.

This keeps the Logic Solver's visual language consistent with the Circuit Lab's hand-authored schematic engine, whose reference renderer uses explicit gate helpers and routed `wireHopH`/`wireV` connections.
