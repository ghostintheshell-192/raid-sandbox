# Current Status

## Project State

**Last Updated**: 2026-07-24

**Current Phase**: Live in its own repo. Extracted from the personal-site repo and
deployed to **[raid-sandbox.dev](https://raid-sandbox.dev)** via Vercel (auto-deploy from
`main`, HTTPS enforced by `.dev`). The old site (`ghostintheshell-192.github.io`) now
forwards its two indexed game URLs here via canonical + refresh stubs.

**Active Work**: none in flight. Next candidate is the **mobile inline picker** (see below).

## Recent Milestones

- Repo extraction + Vercel + custom domain: game split into its own repo (89-commit
  history preserved), connected to Vercel, `raid-sandbox.dev` live in HTTPS,
  site stubs forward old URLs - 2026-07-24
- RAID combinations: 50/60 placement+animation, RAID 1E, 100, 51/61 recognition —
  layouts anchored to Linux md source, golden hand-derived, verified in-browser - 2026-06-14
- Responsive/mobile UX pass: sidebar wrap + accordion palette, collapsible physical
  layer - 2026-06-14
- Domain data extracted from `src/` into `data/` resource files - 2026-06-13
- RAID Sandbox v1 complete — roadmap phases 0–5 (spec:
  `specs/implemented/raid-sandbox-domain-model.md`) - 2026-06-07

## Next Steps (task list)

- [ ] **Mobile inline picker** — invert the touch flow: tap an empty slot → it offers
      the piece types that fit its `axis` (inline expansion), instead of drag-to-place.
      Machinery mostly exists: `canvas-controller.js` sets `el.dataset.axis`; the drop
      handler already filters `payload.type === axis`. Kills the tutorial question and
      makes invalid combinations *unbuildable*.
- [ ] **Validator phase 2** — refactor `validator.js` into a declarative rule registry
      ({code, severity, layer, run}), dedup by (code, nodeId); then add data-layer SOFT
      constraints (`mixed-disk-sizes`, `uneven-spans` → warn, don't block). Its step 1
      (registry) may be pulled forward if the picker needs finer validity than `axis` alone.
      Details in `specs/` completion log and the 2026-06-14 handoff.
- [ ] **Vendor js-yaml locally** — boot currently costs ~15 round-trips (external CDN
      blocking script + per-file YAML fetches). Degrades gracefully but half a second of
      blank screen on slow 4G. Same phase as mobile work.
- [ ] **TypeScript via `@ts-check`** — incremental, zero runtime change.
- [ ] **CI** — GitHub Actions running the headless node suites (Vercel preview deploys
      are a checkbox, not CI).
- [ ] **Touch gesture** — re-scope after the inline picker (the `touch-dnd.js` shim may
      become desktop-only dead code).
- [ ] **Knowledge Base rework** — scope undefined (Valentina's note); ask what feels
      wrong before touching `kb.html` / `kb.js`.

## Active Issues

See `.development/tech-debt/`:

- `nested-data-allocation-order.md` — **mostly RESOLVED**. Per-span order is
  Linux-verified (write-order bug fixed, golden hand-derived); only the cross-span
  stacking order remains a documented convention, by design.
- Known wart: `capacityGB` holds the disk chips' native unit (1/2/4, displayed as "TB").
  Rename was out of scope for v1.

## Notes

- **Test suite**: headless node files in `tests/` — run each with `node <file>`; plus
  browser test pages (`*.test.html`) and demos. Responsive/touch/accordion work is
  browser-only (guarded), does not touch the headless suite.
- **Zero-dependency**: YAML parsed in-browser via js-yaml; node tests must not require
  YAML parsing at runtime.
- **Ground truth**: layouts anchored to the Linux `md` source (`raid5.c`/`raid10.c`);
  golden tables hand-derived, never dumped from the engine.
