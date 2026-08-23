# LogicFlow v3 integration

This build keeps the requested architecture: Next.js App Router + Tailwind + Framer Motion.

## Files

- `app/page.tsx` — application shell, theme, persistence, header, shortcuts, workspace routing.
- `app/layout.tsx` — metadata + global CSS.
- `app/globals.css` — semantic theme tokens, cursor support, signal glow animation, grid system.
- `components/logicflow/Studio.tsx` — your hero/studio visual language, live quick lab, panels, header.
- `components/logicflow/Solver.tsx` — backend solver, truth table, K-map, dynamic schematic, signal analyzer, exports.
- `components/logicflow/CircuitLab.tsx` — 18 circuit blocks, live evaluator, glowing propagation schematic, timing graph.
- `components/logicflow/SevenSegment.tsx` — BCD/HEX, common-anode/cathode, phosphor colors, counter, reverse decoding, analyzer.
- `components/logicflow/types.ts` — shared types.

## Backend

Set:

`NEXT_PUBLIC_API_URL=https://your-backend.example.com`

The solver uses the confirmed routes already present in the original frontend:

- POST `/api/logic/generate`
- POST `/api/logic/expression`
- POST `/api/logic/truth-table`
- POST `/api/logic/minterms`
- POST `/api/logic/maxterms`

The API/Docs workspace can inspect `/openapi.json` at runtime.

## UI direction

This is intentionally not a copy of the friend's static UI. The visual language stays closer to the original LogicFlow design you shared: large editorial hero, floating quick lab, rounded cards, colorful semantic accents, animated cursor, particles and Framer Motion transitions. The friend's engineering features are integrated into those surfaces.

## Important

The circuit lab is a client-side educational simulator for the supported 18 circuit definitions. It is deliberately independent from the solver backend so it stays responsive while inputs change.
