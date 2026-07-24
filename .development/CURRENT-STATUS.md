# Current Status

## Project State

**Last Updated**: 2026-07-24

**Current Phase**: Live in its own repo. Extracted from the personal-site repo and
deployed to **[raid-sandbox.dev](https://raid-sandbox.dev)** via Vercel (auto-deploy from
`main`, HTTPS enforced by `.dev`). The old site (`ghostintheshell-192.github.io`) now
forwards its two indexed game URLs here via canonical + refresh stubs.

**Active Work**: none in flight. Next candidates: **vendor js-yaml locally** and/or
**validator phase 2** (see below).

## Recent Milestones

- **CI + branch protection** (PR #2, merged): GitHub Actions runs the 10 headless suites
  on push/PR; `main` protected lightly (required `headless` check to merge PRs, admin
  commits still allowed). The automated gate the repo lacked - 2026-07-24
- Mobile **tap-to-build** (PR #1, merged to `main`, live): the mobile inline picker
  grew into a full tap-to-build flow — every empty zone (canvas, loose disk, array,
  attribute slot) taps open an inline picker of what fits, each option carrying its
  own action; soft glow on the active zone; canvas-first mobile layout. Additive, not
  gated (drag stays the desktop path). **Scope fixed: single backplane**; multi-group
  RAID on the data layer stays. Validated in-browser (author + a designer) - 2026-07-24
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

- [x] **Mobile inline picker** — DONE, shipped as mobile **tap-to-build** (PR #1, live).
      Grew beyond the original slot picker: every empty zone taps open an inline picker;
      reusable `_openPicker(anchor, options, {kind, placeAfter})`; canvas-first layout;
      persistent "+ add a disk" zone keeps multi-group RAID reachable by tap. Follow-up
      parked: **nesting arrays via tap** (RAID 50/60) still needs drag on desktop. The
      datacenter/`seal`/`edit` roadmap is in `.memory-bank/ideas/2026-07-24-datacenter-tab-seal-edit.md`.
- [ ] **Validator phase 2** — refactor `validator.js` into a declarative rule registry
      ({code, severity, layer, run}), dedup by (code, nodeId); then add data-layer SOFT
      constraints (`mixed-disk-sizes`, `uneven-spans` → warn, don't block). Its step 1
      (registry) may be pulled forward if the picker needs finer validity than `axis` alone.
      Details in `specs/` completion log and the 2026-06-14 handoff.
- [ ] **Vendor js-yaml locally** — boot currently costs ~15 round-trips (external CDN
      blocking script + per-file YAML fetches). Degrades gracefully but half a second of
      blank screen on slow 4G. Same phase as mobile work.
- [ ] **TypeScript via `@ts-check`** — incremental, zero runtime change.
- [x] **CI** — DONE (PR #2, merged). `.github/workflows/tests.yml` runs the 10 headless
      suites (one at a time, zero deps) on every push to main and every PR. `main` is now
      branch-protected (lightweight): the `headless` check is **required to merge a PR**;
      `enforce_admins: false` so the owner can still commit directly to main; force-push
      and deletion of main are blocked. This is the automated gate a future `develop`
      flow was waiting on.
- [ ] **Touch gesture** — re-scope now that tap-to-build ships: on touch, drag is largely
      redundant, so `touch-dnd.js` may be reducible to a desktop-only path (or dead code).
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
