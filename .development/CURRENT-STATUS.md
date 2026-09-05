# Current Status

## Project State

**Last Updated**: 2026-09-05

**Current Phase**: Live in its own repo. Extracted from the personal-site repo and
deployed to **[raid-sandbox.dev](https://raid-sandbox.dev)** via Vercel (auto-deploy from
`main`, HTTPS enforced by `.dev`). The old site (`ghostintheshell-192.github.io`) now
forwards its two indexed game URLs here via canonical + refresh stubs.

**Active Work**: none open. The **degenerate-levels spec** is implemented (PRs #35–#37,
2026-09-05, now `specs/implemented/degenerate-levels.md`): below its minimum a level
collapses into a simpler one, the panel shows what was built next to what runs, and the
diff between them is the trace of rewrites the level files declare. The **agnostic-engine
plan** (2026-09-02) is complete and its technical queue closed (2026-09-04/05). What
waits on a decision, not a task: whether and how to extract the engine into a project of
its own (`reference/engine-robustness-and-extraction.md` §8).

## Recent Milestones

- **Desktop only** ([ADR-003](reference/decisions/003-desktop-only.md), 2026-09-05):
  below 900px the game is no longer offered — `index.html` hides the canvases and shows
  a short notice saying what RAID Sandbox is, that it needs a desktop browser, and
  linking the knowledge base, which stays readable on a phone. No mobile version is
  promised, because none is planned. **What went**: `touch-dnd.js` (the drag-and-drop
  shim), `sidebar-accordion.js`, the ≤900px single-column flow and the
  `pointer: coarse` block in `sandbox.css`, the narrow-screen physical-layer fold and
  its toggle. **What stayed**: the inline picker, no longer a touch affordance but
  click-to-build next to drag-and-drop, and the base for the accessibility work
  (roadmap item 9). One tech-debt closes by deletion — the `touch-dnd.js` re-scope — and one is
  re-scoped: the physical layer's missing picker, now a desktop asymmetry at low priority. Every interface change from here is
  designed once, for one width - 2026-09-05
- **Degenerate levels — what the player has, next to what they tried to build** (PRs
  #35–#37, 2026-09-05, one day after the spec): the leaf level files declare
  `minDisksToRun` (with the kernel line) and `collapsesTo` (RAID 5 @2, RAID 6 @3,
  RAID 10 @2 → a mirror), `raid1.yaml` declares that a mirror of mirrors is one mirror;
  `normalize()` rewrites the tree bottom-up by those rules and keeps the trace;
  `analyze()` computes the numbers on what runs and returns box 2 as `runs`; the content
  algebra (`content.js`, tests only) is the oracle that found exactly those three
  collapses; `min-disks` split into a hard refusal (below `minDisksToRun`) and a soft
  `level-collapse`; the panel shows two boxes and the diff between them, side by side
  from 1600px. §11.1 answered from `raid5.c`: a two-disk RAID 5 writes at a mirror's
  cost. 19 headless suites - 2026-09-05
- **The technical queue, closed by two batches of agents** (PRs #24–#33, 2026-09-04/05):
  five agents per batch, each in its own worktree, one PR each, every one tried in the
  browser. Batch 1: an algorithm drop is refused when the class does not offer it; the
  knowledge base teaches the four levels of spec §8; the level files' numbers moved under
  `reference:` and are tested against the engine; RAID 0+1 reads `high` (a mirror reads
  as wide as the member serving it). Batch 2: the level's `reason` shows on success; the
  algorithm slot stays, disabled and explained, when a class has none; the validator's
  last domain facts moved into the data files (`provides: layout:*`, `engineComponentId`,
  `nvme-backplane` reads `accepts:`); a generic `level-advisory` rule lets a level file
  declare its own warning (RAID 0+1 first); the **write hole** is a soft cross-axis
  warning, `power-loss-protection` declared by the RoC files. Six tech-debts closed, one
  filed (`mirror-of-stripes-write-parallelism`). The validator has nine rules - 2026-09-05
- **ADR-002, two censuses, the degenerate-levels spec** (PRs #15–#23, 2026-09-04):
  ADR-002 "the engine holds no domain facts" and the agnostic-engine spec saved from the
  diary; the refusal-points and unspoken-content censuses (verified line by line,
  corrected where they overstated the code); the PR flow written into `workflow.md`; the
  animation waits on hard violations; `data/algorithms/` validated and its three broken
  files repaired; the two genuinely untested refusals covered; the degenerate-levels idea
  promoted to `specs/planned/degenerate-levels.md` (now `implemented/`) — below its minimum width a level
  collapses into a simpler one, and the game names what was composed next to what runs.
  Kernel facts read from `raid5.c`: RAID 1@2 → RAID 5@2 in place, RAID 6 < 4 refused - 2026-09-04
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

## Next Steps — the roadmap after the agnostic-engine plan

> ~~**Before any of this**: implement the degenerate-levels spec~~ — **done 2026-09-05**
> (PRs #35–#37, `specs/implemented/degenerate-levels.md`): below its minimum width a level
> collapses into a simpler one — a two-disk RAID 5 *is* a mirror, and the kernel says so —
> and the panel now shows what was built next to what runs, with the diff between them.

Valentina's priority order, 2026-09-02. Each item says where it starts (the document
or tech-debt that already holds the thinking) and a size: **S** hours, **M** a
session or two, **L** several sessions. Nothing here is scheduled; the order is the
decision.

1. **Refusal points** — **CENSUS DONE 2026-09-04**, see
   [`reference/refusal-points.md`](reference/refusal-points.md) and its companion
   [`reference/unspoken-content.md`](reference/unspoken-content.md). **Complete
   2026-09-05**: the animation gate (PR #19), the two untested refusals (PR #21), the
   `data/algorithms/` validation (PR #20), the algorithm drop refused by class (PR #24).
   Original scoping: census every place the game must refuse an action, in two
   families: *structural* (the engine cannot hold the state: incompatible port,
   self-loop, hand-wired disk, a document it cannot honour) and *UI* (the canvas
   declines: an algorithm chip on the wrong class — today missing,
   `tech-debt/algorithm-drop-ignores-class.md`). Output: a reference map with one
   test per refusal. Start: `tech-debt/headless-tests-bypass-port-validation.md`
   (resolved — the pattern), `build-document.js` validate(). **M**
2. **Info icons ("i")** — the visual channel for what needs explaining: span, drive
   group, the formula behind a number, "near/far exist only under Linux". Start:
   `specs/planned/informative-ui.md` (the complete inventory; most text already exists
   in `data/`), the decided first channel (hover a violation → highlight its nodes),
   and the engine's discarded `reason` strings. The data-driven engine made this
   cheaper: tooltips already come from `ui:` blocks. **M**
3. **Knowledge base rework** — didactic, deeper than in-game, not a wiki. Same source
   as the icons, two depths, linked both ways. Crosses the SEO ceiling (content not in
   the served HTML): decide whether KB prose stays runtime-loaded or is written into
   the page. Start: `kb.html`/`kb.js`, `data/intro.yaml`, the SEO item below. **L**
4. **The verdict, drawn** — a dashed box around the pieces that form the controller,
   coloured by verdict, the ADR-001 lesson with no words. Start:
   `specs/planned/derived-controller.md` ("the dashed box is the verdict, drawn"),
   `engineNodeId` in the eval result, `highlight.js`. **M**
5. **Technical queue** — **closed 2026-09-05** (see the milestones): the level's
   `reason` on success (PR #28), RAID 0+1 reads high (PR #27), the validator's last ids
   in code (PR #30), `algorithm-drop-ignores-class` (PR #24). The two remaining items
   were both about touch. ADR-003 answered them: ~~the `touch-dnd.js` re-scope~~ (the shim
   is gone), and the physical layer's missing picker re-scoped as a desktop asymmetry,
   low priority, to take up with item 9 (`tech-debt/physical-layer-canvas-has-no-touch-picker.md`).
6. **Challenges on the physical axis** — the requirement vocabulary knows only the
   data metrics; add the RAID type ("must be hardware") and the physical-validator
   phase 2 rules (fake RAID limited to 0/1/5/10, mixed protocols, Storage Spaces).
   Share links make "share your solution" possible. Start: `challenge.js`
   `METRIC_LABEL`, `validator.js` `ctx.level`, spec §11a. **M**
7. **The third axis — runtime** — disk states, simulated failure, rebuild: click a
   disk, break it, watch the array degrade or die. The deferred module of the spec
   and the most game-like thing the sandbox can do; fault tolerance becomes an
   experience instead of a number. Start: spec §2 ("third axis"), the old
   `drive-states.md` notes, `render.js` animate(). **L**
8. **Italian version** — content is YAML, so translating is adding files, not code;
   the UI strings in `index.html`/controllers are the code side. Widens the audience.
   Start: `data/`, `data-loader.js` (a language prefix). **M**
9. **Accessibility** — keyboard and screen-reader paths were never considered; for a
   teaching tool they matter. Start: an audit of `index.html` roles/labels, the
   drag-only interactions. **M**
10. **Extracting the game engine** — the decision this whole plan prepared: second
    domain (datacenter / network topologies / motor workbench), name, scope; then
    `git subtree` with history, never a copy. Start:
    `reference/engine-robustness-and-extraction.md` §4–§8. **L**

Small, any time:

- **Phantom back links** — `index.html` and `kb.html` both carry "← back" to
  `ghostintheshell-192.github.io`; a "made by" link in the footer is honest, an arrow
  is not. **S**
- **Contact form** — the site is static and stays so: `mailto:` + a link to GitHub
  issues is the honest baseline; a third-party form service adds a host to the path
  (the js-yaml argument); a Vercel function would be the first server-side code. **S**
- **SEO: the content is not in the served HTML** — folds into item 3. **M**
- **Google Fonts is the last third-party blocking request** — self-host JetBrains Mono. **S**
- ~~**Push + PR flow**~~ — decided 2026-09-04 and written into `workflow.md` (PR #17):
  a PR per branch, merged from GitHub, so the `headless` check is a gate. One caveat
  learned the hard way (PR #32): a chained PR whose base branch is merged first must be
  re-targeted to `main` before it is merged, or its commits land in a closed branch.

## Active Issues

See `.development/tech-debt/`:

- `canvas-nodes-are-unnamed.md` — open (medium): the canvas does not name the things
  the player builds (roadmap item 2).
- `capacity-approximate-on-mixed-disks.md` — open (medium): usable capacity is
  approximate when an array mixes disk sizes.
- `mirror-of-stripes-write-parallelism.md` — open (low): a mirror of striped legs
  writes as one disk, so RAID 0+1 gets `writeMult 0.5` and `writeClass medium` against
  1+0's `1` / `high`. Fixing it lets 0+1 satisfy the `database` challenge — a domain
  decision, taken on purpose, recorded there.
- `physical-layer-canvas-has-no-touch-picker.md` — open (low, re-scoped by ADR-003): the physical
  layer has drag-and-drop only, the data layer also click-to-build; take up with item 9.
- `automation-not-checked-on-windows.md` — open (low): hooks and dev scripts are
  tested only on the Linux workstation.
- `nested-data-allocation-order.md` — **mostly RESOLVED**. Per-span order is
  Linux-verified (write-order bug fixed, golden hand-derived); only the cross-span
  stacking order remains a documented convention, by design.
- Known wart: `capacityGB` holds the disk chips' native unit (1/2/4, displayed as "TB").
  Rename was out of scope for v1.

## Notes

- **Test suite**: 19 headless node files in `tests/` — run each with `node <file>`, or all
  via `bash .development/automation/test.sh`; type check via `typecheck.sh`; plus
  browser test pages (`*.test.html`) and demos. Drag-and-drop, picker and animation work is
  browser-only (guarded), does not touch the headless suite.
- **Zero-dependency**: YAML parsed in-browser via js-yaml; node tests must not require
  YAML parsing at runtime.
- **Ground truth**: layouts anchored to the Linux `md` source (`raid5.c`/`raid10.c`);
  golden tables hand-derived, never dumped from the engine.
