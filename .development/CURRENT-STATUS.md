# Current Status

## Project State

**Last Updated**: 2026-09-02

**Current Phase**: Live in its own repo. Extracted from the personal-site repo and
deployed to **[raid-sandbox.dev](https://raid-sandbox.dev)** via Vercel (auto-deploy from
`main`, HTTPS enforced by `.dev`). The old site (`ghostintheshell-192.github.io`) now
forwards its two indexed game URLs here via canonical + refresh stubs.

**Active Work**: none open. The **agnostic-engine plan** (2026-09-02, five steps, all
merged) is complete: the engine reads its domain facts from `data/` instead of
carrying them as code, a build is a document with a shareable link, and the engine is
type-checked via `@ts-check`. What comes next is a decision, not a task — whether and
how to extract the engine into a project of its own (see
`reference/engine-robustness-and-extraction.md` §8). The queue of small items found
during the plan's browser checkpoints is in the plan handoff
(`.memory-bank/2026-09-02-0045-agnostic-engine-refactor-plan.md`, local).

## Recent Milestones

- **Agnostic engine — the §5 promise kept** (five branches, all merged 2026-09-02):
  (1) the physical model lives in `src/engine/` (`catalog.js`, `physical.js`) and is fed
  by `data/components/*.yaml` — ports, the port-type relation, disk routing by
  `accepts:`; `cpConnect` refuses what the catalogue forbids; `evaluate()` is pure;
  (2) the hardware/fake/software verdict is read off each engine object's own
  `verdict:` block and the `roles` in `index.yaml` — no component is named in code;
  proof: the tri-mode controller (`engine-roc-trimode.yaml`) arrived as one file and
  made NVMe hardware RAID buildable; the physical palette is generated from the
  catalogue; (3) the recognizer matches `shape:` blocks from `data/raid-levels/*.yaml`
  (`levels.js`), the old function survives as the oracle over 849 enumerated trees,
  two intended strictnesses confirmed; RAID 0+1 got its file; (4) a build is a
  document (`build-document.js`): `#build=` in the URL, **⧉ Share**, ~500-char
  links, per-state ids; (5) `@ts-check` + JSDoc typedefs (`src/engine/types.js`,
  `jsconfig.json`, `typecheck.sh`, a non-required CI job). 16 headless suites.
  Six tech-debts closed, one filed (`algorithm-drop-ignores-class`) - 2026-09-02
- **Engine audit + extraction map** (`reference/engine-robustness-and-extraction.md`):
  robustness findings F1–F7 (all closed by the plan above), a landscape survey (no
  packaged precedent for compose → recognise → validate → explain), the seam map and
  the extraction path; the decision is Valentina's - 2026-09-01
- **Derived-docs pipeline aligned with dev-dash**: `INDEX.md` and `tech-debt/README.md`
  tracked again (deterministic generators), `post-merge` hook, `merge=generated`
  driver, `04-docs-update` stages everything it regenerates; the hand-written
  tech-debt README prose restored - 2026-08-29/30
- **ADR-001 — engine identity, not position** (PRs #13, #14): hardware vs fake RAID is
  decided by which engine object sits on the path (`engine-roc` / `engine-metadata`),
  software is the case where neither does; the recognizer walks the path
  (`graph.js`); NVMe software RAID buildable; in-browser hardware/fake pass - 2026-07-30/31
- **Scaffold alignment** (`chore/scaffold-alignment`): the project config was a partial,
  older-generation copy of the dev-dash scaffold. Restored the root `CLAUDE.md` entry
  point and — the actual gap — the **Session Start** directive that makes the latest
  handoff the first thing read in a session. `.memory-bank/` flattened (the
  `projects/raid-explorer/` nesting was a leftover of the repo split). Doc generators
  ported: `ARCHITECTURE.md`, `INDEX.md` and the tech-debt index now regenerate at session
  start, and `ARCHITECTURE.md` is imported into every session as the navigation map.
  Dev-dash-specific leftovers removed (ADR references, "issues for DevDash"); **this
  project still has no ADRs and imports none** - 2026-07-24
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
- [x] **Validator phase 2 — data layer** — DONE (`refactor/validator-registry`, 3 commits).
      `validator.js` is a declarative registry (`{code, severity, layer, source, run}`),
      violations carry `layer` (data|physical|**cross** — cross-axis and backplane-diversity
      read both axes and calling them 'data' would have been a lie), dedup by (code, nodeId).
      The dedup needed a real nodeId: `compile()` never passed the canvas id to
      `Model.array()`, so every array was indistinguishable — fixed first, on its own commit.
      Soft constraints added and **scoped to where coercion is real**: `mixed-disk-sizes`
      exempts RAID 0/JBOD (md's `create_strip_zones` zones the leftover instead of coercing —
      verified against `raid0.c`), `uneven-spans` says capacity is lost under a mirror parent
      and only throughput under a striped one. Both rows added to the §6 spec table.
- [ ] **Validator phase 2 part 2 — physical layer** (deferred from the 2026-06-14 plan):
      fake RAID limited to 0/1/5/10 (no 6/50/60); mixed-protocol arrays; Windows Storage
      Spaces specifics. The registry is the base, and `ctx.level` is already computed once
      for exactly these rules. *"SATA/SAS need an HBA in the path" is now structural: the
      typed ports refuse the wire (2026-09-02).* Related: the validator still names
      `'os-linux'`, `'backplane'`, `'NVMe'` in code — the one place left; a data-driven
      registry would be the plan's step 3b.
- [x] **Vendor js-yaml locally** — DONE (PR #4, merged). `vendor/js-yaml/js-yaml.min.js`
      (4.1.0, MIT, fetched from the GitHub tag, checksum recorded in `vendor/README.md`)
      replaces the blocking `cdn.jsdelivr.net` script in **both** `index.html` and
      `kb.html`. Removes a third-party DNS + TLS + round-trip from the boot path, and the
      dependency on a host nobody here controls. KaTeX in `kb.html` is still on jsDelivr —
      it ships web fonts, so it is a directory rather than a file; worth doing only if the
      reference content actually uses formulas.
- [x] **SEO metadata** — DONE. Both pages had no `description`, no canonical, no social
      preview and no favicon (so `/favicon.ico` was a 404). Added: descriptions,
      search-shaped titles, canonical, Open Graph + Twitter card, `theme-color`, a
      `favicon.svg` that is an actual left-* RAID 5 parity walk, an
      `apple-touch-icon.png` and `assets/og-image.png` (1200×630, generated by
      `assets/make-og.py`, regenerable). `sitemap.xml` `lastmod` refreshed.
      **JSON-LD carries only checkable facts** — `WebApplication` with no
      `aggregateRating`, no `reviewCount`, no `datePublished`: this project has no
      ratings or reviews, and fabricating them is both a lie about the site and a
      Google structured-data policy violation. `kb.html` gets no JSON-LD at all, see
      the next item for why.
- [ ] **SEO: the content is not in the served HTML** — the real ceiling, and metadata
      cannot lift it. `kb.html` ships an empty `#kb-content` that `kb.js` fills from
      `data/intro.yaml` at runtime, and `index.html` is chrome plus an empty canvas.
      Googlebot does execute JS, but render-stage indexing is slower and less reliable
      than parsing HTML, so the page with the actual RAID *prose* — the one that could
      rank for "raid 10 near vs far layout" — currently offers a crawler almost no text.
      Options, cheapest first: (a) inline the intro prose into `kb.html` and let `kb.js`
      enhance it rather than create it; (b) a tiny pre-render step that bakes
      `intro.yaml` into the HTML at deploy time — but that introduces the build step
      the project has deliberately avoided, so it is a real trade, not a detail.
      Whichever is chosen, `TechArticle`/`LearningResource` JSON-LD becomes honest then.
- [ ] **Google Fonts is still a third-party blocking request** — the same argument that
      justified vendoring js-yaml, and now the last external host on the critical path of
      both pages. Self-hosting JetBrains Mono would close it (KaTeX in `kb.html` is a
      separate, heavier case: it ships web fonts of its own).
- [x] **TypeScript via `@ts-check`** — DONE (2026-09-02, plan step 5): the engine files,
      `canvas-state.js` and `build-document.js` opt in; shapes in `src/engine/types.js`;
      `jsconfig.json` (checkJs off, incremental); `bash .development/automation/typecheck.sh`.
- [ ] **Small items from the plan's browser checkpoints**: show the level's `reason`
      in the results panel on success too (today only on failure —
      `informative-ui.md` D); RAID 0+1 reads "medium" because a linear mirror's read
      class counts legs, not the stripe width inside them; `tech-debt/algorithm-drop-ignores-class.md`.
- [ ] **Extraction of the engine** — a decision, not a task: second domain (Valentina's
      candidates: datacenter, network topologies, motor workbench), data-driven core is
      now done here, name and scope. `reference/engine-robustness-and-extraction.md` §8.
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

- `algorithm-drop-ignores-class.md` — open (low): the drag path accepts an algorithm
  the array's class does not have; the picker already filters. One predicate, two drops.
- `nested-data-allocation-order.md` — **mostly RESOLVED**. Per-span order is
  Linux-verified (write-order bug fixed, golden hand-derived); only the cross-span
  stacking order remains a documented convention, by design.
- Known wart: `capacityGB` holds the disk chips' native unit (1/2/4, displayed as "TB").
  Rename was out of scope for v1.

## Notes

- **Test suite**: 16 headless node files in `tests/` — run each with `node <file>`, or all
  via `bash .development/automation/test.sh`; type check via `typecheck.sh`; plus
  browser test pages (`*.test.html`) and demos. Responsive/touch/accordion work is
  browser-only (guarded), does not touch the headless suite.
- **Zero-dependency**: YAML parsed in-browser via js-yaml; node tests must not require
  YAML parsing at runtime.
- **Ground truth**: layouts anchored to the Linux `md` source (`raid5.c`/`raid10.c`);
  golden tables hand-derived, never dumped from the engine.
