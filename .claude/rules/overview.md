# Project Overview

## RAID Sandbox

An interactive, browser-based learning game for **RAID storage concepts**. The player
drags physical components (disks, controllers, HBAs, OS) onto a canvas, composes arrays,
and watches the resulting data/parity layouts render and animate. It replaces an older
linear "pick the RAID level from a list" quiz with an open **sandbox builder**.

- **Type**: Educational game (single-page, client-side)
- **Home**: [raid-sandbox.dev](https://raid-sandbox.dev)
- **Hosting**: Vercel (automatic deploy from GitHub `main`; `.dev` forces HTTPS)
- **Status**: Live. Extracted 2026-07 into its own repo from the personal-site repo.

## Development Methodology

Spec-driven and incremental:

1. **Specification first** — the design backbone lives in `.development/specs/`
   (`raid-sandbox-domain-model.md` is the blueprint the YAML data and the engine derive from).
2. **Incrementality** — one component/phase at a time, tested before proceeding.
3. **Ground-truth first** — RAID layouts are anchored to the Linux `md` kernel source
   (`drivers/md/raid5.c`, `raid10.c`). Golden tables are **hand-derived from the kernel
   rules**, never dumped from the engine, then asserted against it.
4. **Session handoffs** — continuity notes in `.memory-bank/projects/raid-explorer/`.

## Tech Stack

- **Vanilla HTML/CSS/JS** — no framework, no build step. Rendering is DOM (`render.js`
  builds divs); the file historically named `canvas.html` is now `index.html`.
- **YAML data files** (`data/`) — RAID levels, algorithms, components, challenges.
  Parsed in-browser via **js-yaml**, vendored in `vendor/js-yaml/` (not a CDN, and not
  an npm dependency — see `vendor/README.md`).
- **Zero runtime dependencies** — the headless node tests must not require YAML parsing.

## Architecture (source layout)

- `src/engine/` — `model.js`, `layout.js` (placement), `validator.js`
- `src/sandbox/` — `canvas-controller.js`, `canvas-state.js`, `physical-controller.js`,
  `render.js`, `highlight.js`, `drag-util.js`
- `src/challenge/` — challenge mode
- `data/` — YAML resource files (the domain data, extracted from `src/`)
- `tests/` — headless node suites (`*.test.js`, run one at a time with `node <file>`)
  plus browser test pages (`*.test.html`, demos)

## Key Design Decisions

- **No stack change**: the whole game has to travel as one link, with zero runtime
  dependencies, stay readable as source, and be type-checked without a toolchain.
  Canvas/WebGL/WASM would cost all four and buy rendering speed the game does not need.
  The only sanctioned upgrade path is incremental **TypeScript via `@ts-check`** (zero
  runtime change) — in place since 2026-09-02 on the engine files (`jsconfig.json`,
  `src/engine/types.js`, `.development/automation/typecheck.sh`).
- **Desktop only** since 2026-09-05 ([ADR-003](../../.development/reference/decisions/003-desktop-only.md)):
  below 900px `index.html` shows a short notice and a link to the knowledge base. The
  inline picker survives the removal as click-to-build, next to drag-and-drop.
- **License**: deliberately none for now (= full copyright). If revisited: AGPL-3.0 for
  code + CC BY-SA 4.0 for content.
