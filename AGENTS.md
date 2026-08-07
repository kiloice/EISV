# Repository Guidelines

## Project Structure & Module Organization

Static browser app for recessed installation dimension validation (2D profile, v1.x).

| Path | Role |
|------|------|
| `EISV_1.0.html` | **Only deliverable** for end users (HTML/CSS/SVG + inlined JS). Offline, zero deps. |
| `eisv-core.js` | Pure geometry / pathfinding (no DOM). Source of truth for solver; used by tests and Blob Worker text. |
| `eisv-app.js` | View + app (DOM, URL, debounce, clipboard, worker). |
| `scripts/assemble.mjs` | Inlines core + app into `EISV_1.0.html`. |
| `tests/solve-smoke.mjs` | Node smoke tests for the core. |
| `docs/placement.md` | Final placement invariants, priorities, and postmortem (read before changing `finalPlacementPose`). |
| `README.md` | User- and maintainer-facing summary. |
| `LICENSE` | License text. |

Do **not** reintroduce empty `output/` or commit `.DS_Store`. End users must never need to copy `eisv-*.js` alongside the HTML.

Prefer editing `eisv-core.js` / `eisv-app.js`, then assemble—avoid hand-editing the inlined scripts inside the HTML.

Solver is mode-aware (`mode: "2d"`; `"3d"` reserved). Path search must use a Space interface only—no scattered `if (mode === "2d")` inside BFS.

## Build, Test, and Development Commands

No package manager.

```bash
open EISV_1.0.html              # run deliverable
node tests/solve-smoke.mjs      # core smoke tests
node scripts/assemble.mjs       # rebuild single-file HTML
```

## Coding Style & Naming Conventions

- 2-space indentation for HTML, CSS, and JavaScript.
- Shared colors and drafting line widths in `:root` CSS variables.
- Descriptive classes (`.workspace`, `.stage-head`, `.draft-thick`, …).
- Keep `lang="zh-CN"` and Chinese UI copy unless localization is requested.
- Small, task-scoped edits; no drive-by refactors.

## Testing Guidelines

- Automated: `node tests/solve-smoke.mjs` before assemble/commit when core changes.
- Manual in browser after UI or calculation changes:
  - No console errors on load
  - Inputs update diagram and metrics
  - Boundaries, empty/invalid inputs, topGap vs clearance messaging
  - Desktop and narrow viewports remain usable

## Commit & Pull Request Guidelines

Short imperative summaries (e.g. `Fix topGap clearance messaging`).

PRs should include: behavior change summary, manual test notes, screenshots for UI changes, linked issues when relevant.

## Final placement

Before changing seating / bridge / top-gap final pose logic, read **`docs/placement.md`**: fixed priorities, physical invariants, no-`top`-fallback-with-insets, and the postmortem on why multi-seed patches failed.

Smoke tests already lock center-alignment and `mode !== "top"` when insets exist; keep those assertions when editing placement.

## Agent-Specific Instructions

Do not overwrite unrelated user work. Keep edits traceable to the request. After changing core or app sources, run smoke tests and `assemble.mjs` so `EISV_1.0.html` stays in sync.
