# LogicFlow Theme + Variable Probe Fix

This patch keeps the existing LogicFlow UI and schematic renderer while fixing two UX issues:

## Persistent theme

The selected light/dark theme is now read synchronously from the document theme attribute (set by `app/layout.tsx`) when each `StudioShell` mounts. This prevents route changes from briefly or permanently reverting to dark mode.

The selected theme also updates:
- `localStorage["logicflow-theme"]`
- `html[data-logicflow-theme]`
- `body[data-logicflow-theme]`
- `body` background color
- `color-scheme`

The dark background now has explicit rules for the theme root itself; `.dark .bg-paper` alone cannot match the same element.

## Result variable controls

The Logic Solver result panel now includes a persistent **LIVE INPUT VECTOR** control strip above the result tabs. Every generated variable gets a `0/1` control, the current binary vector is shown, and Reset restores all inputs to LOW without discarding the result.

The existing truth-table/circuit/signal probing behavior remains the source of truth, so the controls drive the same probe state and output history.
