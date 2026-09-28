# Repository Guidelines

## Project Structure & Module Organization

Static browser app for recessed installation dimension validation. Two deliverables are maintained in parallel: **V1** (2D profile, v1.x) and **V2** (3D, v2.x).

| Path | Role |
|------|------|
| `EISV_1.0.html` | V1 deliverable (2D): HTML/CSS/SVG + inlined JS. Offline, zero deps. |
| `EISV_2.0.html` | V2 deliverable (3D): same constraints. |
| `eisv-core.js` | Pure geometry / pathfinding (no DOM). Source of truth for solver; used by tests and Blob Worker text. |
| `eisv-app.js` | V1 view + app (DOM, URL, debounce, clipboard, worker). |
| `eisv-core3d.js` | V2 pure 3D core (no DOM); builds on `eisv-core.js` (section placement, BFS). |
| `eisv-app3d.js` | V2 view + app (four views, worker). |
| `src/base.css` | Shared CSS for both deliverables (`{{BASE_CSS}}`). |
| `src/template.html` / `src/template3d.html` | V1 / V2 markup with `{{VERSION}}` / `{{CORE}}` / `{{CORE3D}}` / `{{APP}}` slots. |
| `scripts/assemble.mjs` | Builds both HTML files; versions come from `meta.version` in `eisv-core.js` (V1) and `eisv-core3d.js` (V2). |
| `tests/solve-smoke.mjs` / `tests/solve3d-smoke.mjs` | Node smoke tests for the 2D / 3D cores. |
| `docs/placement.md` | Final placement invariants, priorities, and postmortem (read before changing `finalPlacementPose`). |
| `docs/3d.md` | V2 model, 5-DOF pose, exact collision, placement and staged planner (read before changing `eisv-core3d.js`). |
| `README.md` | User- and maintainer-facing summary. |
| `LICENSE` | License text. |

Do **not** reintroduce empty `output/` or commit `.DS_Store`. End users must never need to copy `eisv-*.js` alongside the HTML.

`eisv-core.js` is shared by both versions: changing it affects V2 too, so run both smoke tests.

Prefer editing the `eisv-*.js` sources / `src/*`, then assemble—never hand-edit `EISV_*.html`. Bump V1 only in `eisv-core.js` `meta.version`, V2 only in `eisv-core3d.js` `meta.version`.

Solver is mode-aware: `mode: "2d"` → `eisv-core.js`; `mode: "3d"` → `eisv-core3d.js` (`EISV_CORE.solve` delegates when the 3D core is loaded). Path search must use a Space interface only—no scattered `if (mode === ...)` inside BFS; V2 plugs its vertical-plane searches into `findPath` through an adapter.

## Build, Test, and Development Commands

No package manager.

```bash
open EISV_1.0.html              # run V1 (2D)
open EISV_2.0.html              # run V2 (3D)
node tests/solve-smoke.mjs      # 2D core smoke tests
node tests/solve3d-smoke.mjs    # 3D core smoke tests
node scripts/assemble.mjs       # rebuild both single-file HTML files
node scripts/assemble.mjs --check  # fail if either HTML is stale
```

## Coding Style & Naming Conventions

- 2-space indentation for HTML, CSS, and JavaScript.
- Shared colors and drafting line widths in `:root` CSS variables.
- Descriptive classes (`.workspace`, `.stage-head`, `.draft-thick`, …).
- Keep `lang="zh-CN"` and Chinese UI copy unless localization is requested.
- Small, task-scoped edits; no drive-by refactors.

## Testing Guidelines

- Automated: `node tests/solve-smoke.mjs` and `node tests/solve3d-smoke.mjs` before assemble/commit when a core changes.
- Manual in browser after UI or calculation changes:
  - No console errors on load
  - Inputs update diagram and metrics
  - Boundaries, empty/invalid inputs, topGap vs clearance messaging
  - Desktop and narrow viewports remain usable
  - V2: all presets compute; 「再次计算」 animates in all four views

## Commit & Pull Request Guidelines

Short imperative summaries (e.g. `Fix topGap clearance messaging`).

PRs should include: behavior change summary, manual test notes, screenshots for UI changes, linked issues when relevant.

## Final placement

Before changing seating / bridge / top-gap final pose logic, read **`docs/placement.md`**: fixed priorities, physical invariants, no-`top`-fallback-with-insets, and the postmortem on why multi-seed patches failed.

Smoke tests already lock center-alignment and `mode !== "top"` when insets exist; keep those assertions when editing placement. V2 reuses the 2D placement on the part's length section (see `docs/3d.md` §4), so placement changes show up in both versions.

## Agent-Specific Instructions

Do not overwrite unrelated user work. Keep edits traceable to the request. After changing core or app sources, run smoke tests and `assemble.mjs` so `EISV_1.0.html` stays in sync.
