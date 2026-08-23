# LogicFlow v7

This version keeps the original LogicFlow visual system and moves the three large workspaces onto separate Next.js App Router routes.

## Routes

- `/workspace` — original LogicFlow hero / studio landing UI
- `/logic-solver` — original two-panel Boolean solver with API integration
- `/circuit-lab` — 18-circuit interactive reference engine inside LogicFlow cards
- `/seven-segment` — compact 8-segment (7 segments + DP) display lab
- `/api-docs` — confirmed API route list + live `/openapi.json` viewer

`/` redirects to `/workspace`.

## What changed in v7

- Generated logic schematic now uses actual gate silhouettes (AND / OR / XOR / NAND / NOR) instead of generic rectangles.
- Logic wires use separated Manhattan channels and animated HIGH signal particles.
- Circuit Lab uses a custom grouped/searchable dropdown instead of the native `<select>`.
- 8-segment display is compact and keeps controls visible; value changes always synchronize the displayed segment pattern.
- Dark mode has dedicated surfaces for the custom dropdown, routed schematic, implementation panel, circuit engine, graphs, and 8-segment display.
- The original particle field, kinetic cursor, Framer Motion, color-card system and LogicFlow layout remain the visual basis.
- Next.js App Router routes keep the workspaces separated instead of rendering all tools on one page.

## Integration

Copy `app/`, `components/`, `tailwind.config.ts`, and `postcss.config.mjs` into the project. Keep your existing `.env.local` and set:

`NEXT_PUBLIC_API_URL=https://digital-circuits-generator-3.onrender.com`

Existing dependencies such as `next`, `react`, `react-dom`, `framer-motion`, `tailwindcss`, and `autoprefixer` are assumed to already exist in your project.
