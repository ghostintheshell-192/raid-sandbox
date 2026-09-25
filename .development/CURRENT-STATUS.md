# Current Status

## Project State

**Last Updated**: 2026-09-25

**Current Phase**: Live at **[raid-sandbox.dev](https://raid-sandbox.dev)** (Vercel,
auto-deploy from `main`). The game is desktop only
([ADR-003](reference/decisions/003-desktop-only.md)); the knowledge base, generated
from the data, is readable on any screen and is the entry point from a phone.

**Active Work**: the knowledge base's level pages. Seven levels have a page: RAID 0, 1,
5, 6, 10, 1E and JBOD. The seven nested levels (1+0, 0+1, 50, 60, 51, 61, 100) wait on
a generator feature: `exampleTree()` accepts only a level whose members are disks, so a
nested level needs an example tree, the worked numbers on a tree, one grid per span and
a nested *Try it* link. Beside it, the **to-verify queue**
([`tech-debt/kb-to-verify-queue.md`](tech-debt/kb-to-verify-queue.md)): eight pages
with at least one sentence not yet checked against a primary source, to be read one
page at a time, `raid-engine` first.

**Waiting on a decision, not a task**: whether and how to extract the engine into a
project of its own (`reference/engine-robustness-and-extraction.md` §8).

## Recent Milestones

Newest first. The detail of each is in its pull requests and in the spec or ADR it
names.

- **Documentation audit** (2026-09-25): the operational docs brought in line with the
  repository — this file, `.development/README.md`, `specs/README.md`,
  `.githooks/README.md`, `vendor/README.md`. A link's display text in the knowledge
  base is escaped once, not twice (an apostrophe printed as `&#39;` on five pages); the
  plain-text JBOD mentions link to the JBOD page (PR #54) - 2026-09-25
- **RAID 1E and JBOD pages** (PR #53): RAID 1E is `derived`, its grid being the
  existing golden table for near-3. JBOD covers the three meanings of the name and
  treats the first, concatenation. The generator draws a linear array's grid as the
  address range each disk holds, not as stripe rows. Found while writing it: a linear
  array fails as a whole when one disk fails (`md-linear.c`, and Windows on spanned
  volumes); the RAID 0 and redundancy pages said the opposite and are corrected. The
  RAID 10 page explains 1+0 and 0+1 in place of pages that do not exist yet - 2026-09-24
- **Knowledge-base layout, wide to narrow** (PRs #49, #52): the side menu anchored to
  the bottom with the map and glossary pinned at the top; one continuous divider; the
  page index from 1250px; below 1100px a centred, justified reading column with the
  page's sections folded under the heading - 2026-09-15
- **Sandbox status bar and README** (PRs #50, #51): the status bar no longer repeats
  what the panels already say, and holds the link to the knowledge base; the public
  README names the knowledge base, how to serve the app locally, and how to run the
  whole headless suite - 2026-09-15
- **The knowledge base in a technical register** (PR #47): headings name the subject;
  advantages and disadvantages open on the property they state; on a level page every
  transcluded concept reads *Definition*, then a heading that applies it to the level;
  *What happens with fewer disks than the minimum* tells the three cases apart. The
  writing rules are in the `segmentation.yaml` header. PR #48: the architecture map
  sorts in the C locale, so it is the same on every machine - 2026-09-13
- **ADR-004 — every statement names where its truth comes from** (PRs #45, #46): four
  states — cited, derived, chosen, to verify — defined by where a reader would go to
  check. The golden tables are hand derivations in `reference/golden-tables/`, read by
  the layout suite; `sources` is a bibliography of public URLs; the model's choices are
  footnotes, indexed on the `design-decisions` page - 2026-09-07
- **SEO and analytics** (PRs #41–#44): the property is in Search Console and the
  generator writes `sitemap.xml`; Open Graph on every knowledge-base page; `kb.html`
  redirects to `kb/`. Analytics are Vercel Web Analytics, without cookies; GA4 with a
  consent banner was tried and removed the same day - 2026-09-07
- **The knowledge base, generated from the data**
  ([spec](specs/implemented/knowledge-base.md)): one source, two depths, static pages
  written at commit time by `generate-kb.js`; 24 concepts, the first five level pages
  with the worked numbers taken from the engine - 2026-09-06
- **Desktop only** ([ADR-003](reference/decisions/003-desktop-only.md)): below 900px a
  short notice and a link to the knowledge base; the touch shim and the mobile layout
  removed; the inline picker stays as click-to-build - 2026-09-05
- **Degenerate levels** ([spec](specs/implemented/degenerate-levels.md), PRs #35–#37):
  below its minimum a level collapses into a simpler one, and the panel shows what was
  built next to what runs - 2026-09-05
- **The technical queue closed** (PRs #24–#33) and the refusal-points and
  unspoken-content censuses (PRs #15–#23), with ADR-002 - 2026-09-04/05
- **Agnostic engine** ([spec](specs/implemented/agnostic-engine.md)): the engine names
  no component and no level in code; builds are shareable as links; `@ts-check` on the
  engine files - 2026-09-02
- **Engine audit and extraction map** (`reference/engine-robustness-and-extraction.md`) - 2026-09-01
- **Derived docs tracked again**, with a `post-merge` hook and a merge driver - 2026-08-29/30
- **ADR-001 — engine identity, not position** (PRs #13, #14) - 2026-07-30/31
- **Own repository, Vercel, `raid-sandbox.dev`**; CI and branch protection; the
  project configuration aligned with the scaffold - 2026-07-24
- **RAID combinations** (50, 60, 1E, 100, 51, 61) anchored to the Linux `md` source - 2026-06-14
- **Domain data moved from `src/` to `data/`** - 2026-06-13
- **RAID Sandbox v1**, roadmap phases 0–5
  ([spec](specs/implemented/raid-sandbox-domain-model.md)) - 2026-06-07

## Next Steps — the roadmap

Valentina's priority order, 2026-09-02. Each item says where it starts and a size:
**S** hours, **M** a session or two, **L** several sessions. Nothing here is
scheduled; the order is the decision.

1. ~~**Refusal points**~~ — done 2026-09-05
   ([`reference/refusal-points.md`](reference/refusal-points.md)).
2. **Info icons ("i")** — the visual channel for what needs explaining: span, drive
   group, the formula behind a number. Start: `specs/planned/informative-ui.md` and
   [`reference/unspoken-content.md`](reference/unspoken-content.md). **M**
3. **Knowledge base** — the MVP is live and seven of the fourteen levels have a page.
   What remains: the seven nested levels (the generator feature first, see *Active
   Work*), the components page, a model decision for RAID 4
   ([spec](specs/implemented/knowledge-base.md) §9, §14), and the to-verify queue.
   Before `raid0plus1` gets a page, its `pros` has to stop naming the sandbox. **M**
4. **The verdict, drawn** — a dashed box around the pieces that form the controller,
   coloured by verdict. Start: `specs/planned/derived-controller.md`, `highlight.js`. **M**
5. ~~**Technical queue**~~ — closed 2026-09-05.
6. **Challenges on the physical axis** — the RAID type as a requirement ("must be
   hardware") and the physical validator's phase 2 rules. Start: `challenge.js`
   `METRIC_LABEL`, `validator.js` `ctx.level`, domain-model spec §11a. **M**
7. **The third axis — runtime** — disk states, simulated failure, rebuild. Start:
   domain-model spec §2 ("third axis"), `render.js` animate(). **L**
8. **Italian version** — content is YAML, so translating is adding files; the UI
   strings are the code side. Start: `data/`, `data-loader.js`. **M**
9. **Accessibility** — keyboard and screen-reader paths. Start: an audit of
   `index.html` roles and labels, the drag-only interactions. **M**
10. **Extracting the game engine** — second domain, name, scope; then `git subtree`
    with history. Start: `reference/engine-robustness-and-extraction.md` §4–§8. **L**

Small, any time:

- **Feedback link in the footer** (GitHub issues) — the prerequisite of the
  distribution plan in `.memory-bank/ideas/2026-09-07-distribution-plan.md`. **S**
- **Google Fonts is the last third-party blocking request** — self-host JetBrains Mono. **S**

## Active Issues

See `.development/tech-debt/` (its `README.md` is the generated index):

- `kb-to-verify-queue.md` — open (medium): eight knowledge-base pages to read against
  their sources.
- `canvas-nodes-are-unnamed.md` — open (medium): the canvas does not name the things
  the player builds (roadmap item 2).
- `capacity-approximate-on-mixed-disks.md` — open (medium): usable capacity is
  approximate when an array mixes disk sizes.
- `physical-layer-canvas-has-no-touch-picker.md` — open (low, re-scoped by ADR-003):
  the physical layer has drag-and-drop only; take up with item 9.
- `automation-not-checked-on-windows.md` — open (low): hooks and dev scripts are
  tested only on Linux.
- `nested-data-allocation-order.md` — mostly resolved: only the cross-span stacking
  order remains a documented convention, by design.
- Known wart: `capacityGB` holds the disk chips' native unit (1/2/4, displayed as "TB").

## Notes

- **Tests**: 23 headless suites in `tests/`, run one at a time with `node <file>` or
  all together with `bash .development/automation/test.sh`; the type check with
  `typecheck.sh`; browser test pages (`*.test.html`) and demos for what only a browser
  can show.
- **Zero dependencies**: YAML is parsed with the vendored js-yaml (`vendor/`); the
  headless suites never parse YAML.
- **Ground truth**: layouts are anchored to the Linux `md` source
  (`raid5.c`/`raid10.c`); the golden tables are derived by hand, never dumped from the
  engine.
- **This file is written by hand.** No hook regenerates it, so it is updated at the
  end of a piece of work, not left to drift.
