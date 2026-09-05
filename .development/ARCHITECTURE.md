# Architecture Reference

Quick reference for navigating the RAID Sandbox codebase.
For detailed documentation, see `.development/specs/`.

## Layer Overview

Vanilla HTML/CSS/JS, no framework and no build step. Files are IIFEs attached to
a global namespace (`root.RaidRender`, `root.CanvasState`, …), not ES modules.

```text
data/ (YAML)  →  engine/  →  sandbox/  →  DOM
                    ↑
                 challenge/
```

- **`src/engine/`** — headless and DOM-free. `model.js` (recursive domain model +
  level recognizer), `layout.js` (physical placement grid), `validator.js`
  (constraint engine). This layer is what the headless suites assert against,
  and it must stay independent of the DOM for that to remain possible.
- **`src/sandbox/`** — owns the DOM. Controllers (`canvas-controller.js`,
  `physical-controller.js`), state (`canvas-state.js`) and rendering
  (`render.js`). Desktop only (ADR-003): building is drag-and-drop plus the
  inline click-to-build picker.
- **`src/challenge/`** — challenge mode, built on top of the same engine.
- **`data/`** — YAML resource files, parsed in-browser. The headless tests do
  not read them: they must run with zero dependencies.

The dependency arrow points one way. `engine/` never reaches into `sandbox/`.

**Ground truth**: layouts are anchored to the Linux `md` kernel source
(`drivers/md/raid5.c`, `raid10.c`). Golden tables are hand-derived from the
kernel rules and never regenerated from the engine.

## Key Decisions

- [ADR-001: The RAID engine's type comes from which object it is, not where it sits](reference/decisions/001-engine-identity-not-position.md) `[high]` — Hardware vs. fake RAID is decided by which of two distinct engine objects sits on the control path (compute silicon vs. metadata-only chip), not by the engine's position relative to the PCIe bus; software RAID is the configuration where neither is present.
- [ADR-002: The engine holds no domain facts — it reads them from data files](reference/decisions/002-the-engine-holds-no-domain-facts.md) `[high]` — The engine's code knows *how* to compose, recognize, validate and explain; it does not know *what* a backplane, a RAID-on-Chip or a RAID 5 is. Every domain fact — components, ports, verdicts, level shapes, disk minimums — lives in the YAML files and is read from there, so adding a capability is adding a file.
- [ADR-003: RAID Sandbox is a desktop game — the mobile flow is removed](reference/decisions/003-desktop-only.md) `[medium]` — Below the desktop breakpoint the game is no longer offered. A phone or a narrow window gets a short page that says what RAID Sandbox is, that it needs a desktop browser, and points to the knowledge base — which stays readable on mobile. The touch shim, the mobile layout and the accordion palette go; the inline picker stays, as click-to-build on desktop. No mobile version is promised.

## Project Tree

> Auto-generated from source code.
> Run `.development/scripts/generate-architecture.sh` to update.


### src/challenge
- `challenge.js` — RAID Sandbox: prompt-mode win-check (Phase 5, Stage D).
- `challenge-ui.js` — Challenge mode UI for the RAID Sandbox.

### src/engine
- `catalog.js`
- `content.js`
- `graph.js`
- `layout.js`
- `levels.js`
- `model.js`
- `physical.js`
- `types.js`
- `validator.js`

### src/sandbox
- `build-document.js`
- `canvas-controller.js` — RAID Sandbox: drag-and-drop controller (Phase 3).
- `canvas-state.js`
- `data-loader.js` — RAID Sandbox: fetch an indexed resource family (browser-only).
- `drag-util.js` — shared drag-and-drop helpers for canvas-controller and physical-controller.
- `highlight.js` — RAID Sandbox: "what I am talking about is THAT one".
- `physical-controller.js` — RAID Sandbox: physical layer (axis A) canvas controller.
- `render.js` — RAID Sandbox: render + animate a placement grid (Phase 2b).

### tests
- `algorithms-data.test.js` — validates the REAL algorithm YAML files in data/algorithms/. Run with: node algorithms-data.test.js   (uses python3 + pyyaml to read YAML; this repo is zero-dependency and Node has no YAML parser, so ...
- `build-document.test.js` — headless tests for the build document (save / load / share). Run with: node build-document.test.js
- `canvas-algo-integration.test.js` —  End-to-end: canvas state → algorithm chip → computePlacement → different grids. Run: node canvas-algo-integration.test.js
- `canvas-state.fuzz.test.js` — deterministic gesture-workflow fuzz test. Run with: node canvas-state.fuzz.test.js
- `canvas-state.test.js` — headless tests for canvas-state.js Run with: node canvas-state.test.js
- `catalog.test.js` — headless tests for the component catalogue (engine/catalog.js). Run with: node catalog.test.js
- `challenge-data.test.js` — validates the REAL challenge YAML files. Run with: node challenge-data.test.js   (uses python3 + pyyaml to read YAML; this repo is zero-dependency and Node has no YAML parser, so python is the reader....
- `challenge.test.js` — headless tests for the requirement-satisfaction win-check. Run with: node challenge.test.js
- `collapses-oracle.test.js` — the content algebra (engine/content.js) against the declared `collapsesTo` rules, in both directions (degenerate-levels §6, §10). Run with: node collapses-oracle.test.js
- `components-data.test.js` — validates the REAL component YAML files and keeps the headless fixture aligned with them. Run with: node components-data.test.js   (uses python3 + pyyaml to read YAML; this repo is zero-dependency and...
- `graph.test.js` — headless tests for the control-path graph module. Run with: node graph.test.js
- `layout-golden.test.js` — golden-table verification for all parity algorithms. Run with: node layout-golden.test.js
- `levels-oracle.test.js` — the hand-written recognizer as ORACLE for the data-driven one. Run with: node levels-oracle.test.js
- `levels.test.js` — headless tests for the level catalogue and the shape matcher (engine/levels.js). Run with: node levels.test.js
- `model-normalize.test.js` — headless tests for `normalize()` and the two-box `analyze()` (specs/implemented/degenerate-levels.md §4, §7, §10 "Recognition"). Run with: node model-normalize.test.js
- `model-perf.test.js` — headless tests for the performance derivation (§4b). Run with: node model-perf.test.js
- `model-recognize.test.js` — headless tests for the level RECOGNIZER (§4). Run with: node model-recognize.test.js
- `raid-levels-data.test.js` — validates the REAL raid-levels YAML files and keeps the headless fixture aligned with them. Run with: node raid-levels-data.test.js   (uses python3 + pyyaml to read YAML; this repo is zero-dependency ...
- `test-helpers.js` — shared test harness for all Node-runnable test files. Usage: const { test, assert, eq, finish } = require('./test-helpers.js');
- `validator.test.js` — headless tests for the §6 constraint engine. Run with: node validator.test.js

### tests/fixtures
- `components.js` — fixtures/components.js — the component catalogue MANIFEST, as the headless tests see it.
- `raid-levels.js` — fixtures/raid-levels.js — the level catalogue MANIFEST, as the headless tests see it.

---

*Auto-generated by `.development/scripts/generate-architecture.sh`*
