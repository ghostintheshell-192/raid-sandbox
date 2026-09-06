# Knowledge base — one source, two depths, pages that stand alone

**Status:** implemented 2026-09-06 (branch `feature/knowledge-base`, one PR) — the first deliverable of §9 and more; see *Implementation notes* at the end for what was decided differently
**From:** roadmap item 3 (knowledge base rework); [`informative-ui.md`](informative-ui.md) (the inventory, item 2) and [`reference/unspoken-content.md`](../../reference/unspoken-content.md) (the census of what is written and never shown)
**Builds on:** [ADR-002](../../reference/decisions/002-the-engine-holds-no-domain-facts.md) (facts live in data files), [ADR-003](../../reference/decisions/003-desktop-only.md) (the knowledge base is the mobile front door), the no-unverifiable-claims rule
**Ground truth:** the engine's own rules (`model.js`) for every number; the Linux `md` source and cited references for every sentence that states a fact

## 1. The case

The knowledge base today is `kb.html` plus `kb.js`, which loads one file, `data/intro.yaml`, and
draws a short reference: a headline, two storage layers, two concepts, four parameters. It is
good-looking and thin. Meanwhile the data files hold six prose fields on each of fourteen level
files, seven algorithm files, and a `description` on every component — written, and read by
nobody. The census of 2026-09-04 counted it: the knowledge base is half a channel problem.

The other half is what is genuinely missing. There is no page that shows *how* a number is
computed — what makes a RAID 5 survive one failure and a three-way RAID 1 survive two — and no
page that says how the pieces connect: segmentation to redundancy to algorithm to the system
that runs it. Someone who studies RAID, or works with it, needs that; the game computes it every
time a disk lands on the canvas and never explains it.

And Google sees none of it. The prose is assembled in the browser from YAML, so the served HTML
is an empty `#kb-content`. Three pages are not indexed today; this is the likeliest reason.

## 2. What the reader gets

Four kinds of page, one hierarchy declared on top of them:

| page | job | how it is read |
|---|---|---|
| **Map** (`kb/`) | the index: the four storage layers in order, then the concepts, the levels, the glossary | first, and to come back to |
| **One page per level** (`kb/raid5.html`, …) | everything about that level, *without leaving the page* | top to bottom, to learn |
| **Concepts** (`kb/concepts.html`) | the long form of every concept, in the map's order | to go deeper on one thing |
| **Glossary** (`kb/glossary.html`) | every term and concept, one short line each | to look something up |

A fifth, **Components** (`kb/components.html`: RoC, tri-mode RoC, HBA, backplane, BBU, the two
operating systems, and how they relate), is planned and comes after the levels (§9).

Why this shape and not a wiki: the research Valentina brought (Sweller's cognitive load;
Mayer's segmenting and signaling; the hypertext studies) says the same thing three ways. To
*learn* something new, a declared hierarchy with small self-contained units beats a flat network
of links; the network is right for *consulting* what you already hold in your head. So the level
page is a fixed sequence a reader can trust, the map is the hierarchy made visible, and the
glossary is where the wiki lives — for looking up, not for learning.

## 3. Two depths, one source

Every concept exists in two forms, written once:

- **short** — two or three sentences. This is what gets *transcluded* into every level page that
  needs the concept, and what the information icon in the sandbox shows (item 2).
- **long** — the full explanation, with its sources. It lives on the concepts page only, and a
  level page links to it.

A level page therefore never sends the reader away to understand it: every concept it needs is
there in its short form, applied to that level. The long form is one click away, for depth. This
is the answer to "single sourcing" (Valentina's transclusion idea) and to its cost: full
transclusion would make fourteen pages repeat the same paragraphs. Short inline, long behind a
link — segmented, self-contained, and not a dissertation.

A **term** is a concept that has only a short form. One family, one field to tell them apart.

## 4. The level page — a fixed schema

Every level page has the same sections, in the same order. The order is content: it is the path
from "how is the data split" to "what runs it", and the reader learns the page's shape once.

1. **Title and the one line** — the level's name, its class in words (*striped + single parity*),
   the sentence that says what it is.
2. **Segmentation** — the concept's short form, then *applied*: the level's own grid, drawn from
   `layout.js` on the level's example (§5), with the striped and the linear case shown side by
   side where the level allows both meanings to be confused.
3. **Redundancy** — the concept's short form, then the **worked calculation**: capacity, fault
   tolerance and write penalty for the example, each as a substitution into the base rule with
   the numbers filled in, and the result the engine computes (§6). Not a table of numbers: a
   number never stands alone, it stands inside its derivation.
4. **Algorithm** — the concept's short form, then the *scope*: which algorithms this level's
   class accepts (from the engine's own predicate, the same one the algorithm slot uses), each
   with one line from its file in `data/algorithms/` — read at last.
5. **Where it runs** — derived from the component files: which engines can run this level and
   its algorithms (`near`/`far`/`offset` only under Linux `md`; the write hole on an engine with
   no protected cache), with the Linux (`mdadm`) and Windows (Storage Spaces) notes the files
   already carry.
6. **Below the minimum** — from `collapsesTo` and `minDisksToRun` (degenerate levels): what the
   level becomes with fewer disks, and whether the real system starts it, with the kernel line.
7. **In practice** — pros, cons, use cases, compressed to a few lines. A confirmation, not the
   lesson: if sections 2–6 did their job the reader already knows when to use this level.
8. **Try it** — a link into the sandbox with the example already built (`#build=`, generated),
   stated as a desktop link (ADR-003).
9. **See also** — the level's `related` concepts and the levels it is usually confused with
   (RAID 10 / 1+0 / 0+1; RAID 1E), from the data.

Sections 2–5 each open with a transcluded short form: the reader meets *segmentation* on the
RAID 0 page and meets it again, the same two sentences, on the RAID 5 page. That repetition is
deliberate (self-contained units); the applied part under it is what differs.

## 5. The data

Per ADR-002 the content is data. The generator (§7) reads it; the game reads the short forms.

### 5.1 `data/kb/<id>.yaml` — one file per concept or term

```yaml
id: fault-tolerance
kind: concept            # concept | term — a term has no `long`
name: Fault tolerance
short: >
  How many disks can fail, in the worst place, before data is lost. It depends only on
  the redundancy axis — and on how the pieces are nested.
long: |
  … (markdown; the full explanation, worked examples, the nuance that a level's number is
  its tolerance at the minimum, not the array's) …
related: [redundancy, mirroring, parity, rebuild]
sources:
  - "Patterson, Gibson, Katz — A Case for Redundant Arrays of Inexpensive Disks (1988)"
  - "src/engine/model.js failuresToKill() — the rule the sandbox computes with"
status: written          # written | to-verify — a page prints the flag for to-verify
```

`sources` is required on a concept. A concept whose sentences are not yet checked against a
primary source carries `status: to-verify`, and the page prints it. This is how the five absent
concepts of the census (*RAID is not a backup*, why parity rotates, scrubbing, strip and stripe
size, degraded-mode performance) can enter without the project printing claims it has not
verified.

### 5.2 The level files — a `kb:` block

```yaml
# data/raid-levels/raid5.yaml (added)
kb:
  short: >
    Data striped across all disks, one parity block per stripe, rotating. Any single disk
    can fail and everything is rebuilt from the rest by XOR.
  long: |
    … (the level's own story: what the parity is, why it rotates, the small-write problem) …
  example: { disks: 4, sizeGB: 2, protocol: SATA, algorithm: left-symmetric }
  related: [striping, parity, write-penalty, rebuild, raid6, raid50]
  confusedWith: []        # raid10: [raid1plus0, raid0plus1, raid1e]
```

The prose fields that already exist (`description`, `pros`, `cons`, `useCases`, `notFor`,
`note`) are not duplicated: the generator reads them for §4.7 and `note` where present. The
`reference:` block stops being "reference only": `capacityFormula` becomes the worked template
(§6), and `writePenalty` the numbers the template explains.

### 5.3 What the other files contribute, unchanged

- `data/algorithms/*.yaml` — read for §4.4, per class. First time anything reads them.
- `data/components/*.yaml` — `description`, `provides`, `layouts.reason`, `writeHole.reason`,
  `verdict.reason` feed §4.5 and, later, the Components page. The BBU enters as the object that
  provides `power-loss-protection` — the capability the write-hole rule already asks for.
- `data/intro.yaml` — becomes the Map's spine: the four layers in order are its
  `storageLayers`, which turn into four `kind: term` files plus the ordering.
- `data/raid-types.yaml` and `data/element-popups.yaml` — written in June for a visualize tab
  that never came; their *intent* is this spec (contextual popups "with the formula applied to
  the display disk count"). Their content migrates into `kb/` entries and the level `kb:`
  blocks; whether the files then retire is Valentina's call, taken when the migration is done.

## 6. The worked calculation — numbers from the engine, words from the data

Nobody writes "6 TB" by hand. A level declares an **example** (§5.2); the generator builds that
tree with `model.js`, asks for `capacityGB`, `faultTolerance`, `performance`, and prints the
derivation:

```text
Capacity — (N − 1) × disk size
  N = 4 disks of 2 TB → (4 − 1) × 2 TB = 6 TB usable

Fault tolerance — the disks an adversary must kill, minus one
  parity1: the two smallest members must fail → 2 → tolerance 1

Write penalty — one logical write costs
  random: read old data, read old parity, write both → 4 I/Os
  sequential: a full stripe computes parity once → 1 I/O
```

The **template** for each number is data: `reference.capacityFormula` on the level (already
there, in words) with placeholders the generator fills — `(N − 1) × {size}`; the fault-tolerance
sentence is the redundancy concept's `worked` text keyed by redundancy; the write-penalty lines
come from the level's `reference.writePenalty` and the concept's explanation of each cost. The
**result** is always the engine's. A data test asserts that the template's arithmetic, evaluated
on the example, equals what the engine returns — the same discipline as
`faultToleranceAtMinimum`, extended from one number to the three the page shows. The knowledge
base cannot contradict the panel, because the same code produced both.

This also closes the last thread of `tech-debt/level-numbers-duplicated-untested.md`: the
`reference:` block stops being a duplicate nobody reads and becomes the words for a number the
engine computes.

`tech-debt/mirror-of-stripes-write-parallelism.md` is fixed in this work, in the performance
concept's step: documenting the write-parallelism rule and correcting where it is wrong (a mirror
of striped legs writes at one leg's width) is the same task. The domain decision recorded there
(RAID 0+1 then satisfies the `database` challenge) stands.

## 7. Where the pages are made — decided: generated, tracked, served static

**The pages are generated from the data at commit time and committed**, not assembled in the
browser. This is the one structural decision of the spec, and it is the same pattern the repo
already runs for `ARCHITECTURE.md`, `INDEX.md` and the tech-debt index: a generator in
`.development/scripts/`, run by the pre-commit hook (`04-docs-update`), deterministic (same
input, same bytes), its output tracked.

- `generate-kb.js` (Node — the engine is JavaScript and the worked calculation needs it; YAML
  parsed with the vendored `vendor/js-yaml`, which is a UMD build and loads under Node: zero new
  dependencies) reads `data/kb/`, `data/raid-levels/`, `data/algorithms/`, `data/components/`
  and writes `kb/index.html`, `kb/concepts.html`, `kb/glossary.html`, `kb/<level>.html`.
- The pages carry their text in the HTML. `kb.js`, the runtime YAML load and the KaTeX CDN go;
  formulas are set as text (monospace, the site's own face), not LaTeX. The `<!-- No JSON-LD
  here on purpose -->` note in `kb.html` says exactly when JSON-LD becomes honest: now.
  `TechArticle` per page, with only what the page verifiably contains.
- `kb.html` stays as a redirect to `kb/` so the canonical URL and the old links keep working.
- Every generated page is a plain document: no script needed to read it, single column under
  760px, readable on a phone — it is the mobile front door of ADR-003.

Alternative considered and rejected: keep the runtime rendering and add a prerender for crawlers.
Two rendering paths for one content, and the harder one only serves robots.

## 8. The icons — item 2 lands on this

`informative-ui.md` asked *which file is authoritative per concept*. Answer: `data/kb/<id>.yaml`.
The information icon on a chip or a badge shows the concept's `short`, and its "read more" is
`kb/<page>.html#<id>` — the concepts page at the concept, or the level page at the section. Same
source, two depths, linked both ways; the icons need no text of their own. The game loads the
short forms the way it loads the levels (`data-loader.js`), the generator loads everything.

## 9. The order of the content

The schema is cheap; the prose is the work. Written in this order, so the knowledge base is
useful before it is complete:

1. **Concepts the first five levels need**: the four layers (terms), segmentation, striping,
   redundancy, mirroring, parity, capacity, fault tolerance, write penalty and the performance
   classes, algorithm (what a placement algorithm is), chunk / strip / stripe.
2. **Levels 0, 1, 5, 6, 10** — the map, the glossary and the five pages. This is the first
   deliverable; the site is better at this point than it is today.
3. **The rest of the levels**: 1E, 1+0, 0+1 (the confusion page), 50, 60, 51, 61, 100, JBOD.
4. **Components** (§2) and the BBU.
5. **The absent concepts**, each with its sources before its text: RAID is not a backup; why
   parity rotates (RAID 4); scrubbing / patrol read; degraded-mode performance; rebuild time.

## 10. Tests

- **Data** (`kb-data.test.js`, python-read YAML like the other data suites): every `data/kb`
  file has `id`, `kind`, `name`, `short`, `sources` (concepts), `long` (concepts); every
  `related` id exists; every level has a `kb:` block with `example`, and the example builds
  with the engine; `status: to-verify` only where `sources` is empty.
- **The worked calculation**: for every level, the template evaluated on the example equals the
  engine's number (capacity, fault tolerance, write penalty).
- **The generator**: deterministic (a second run changes no byte); every internal link
  resolves; every `short` transcluded on a level page equals the one in its file.
- The headless suites stay zero-dependency: the generator is not a test and may use the
  vendored parser; the data suite reads YAML through python as today.

## 11. Open questions

1. **How long is `long`.** The bound is "for those who study and those who work with it, not a
   post-doc dissertation" — to calibrate on the first concept written and held to after.
2. **The concept files' language**: markdown in `long` needs a renderer in the generator (a small
   one, or a subset: paragraphs, lists, code, links). To decide at the first page.
3. **The results panel** could link the recognized level to its page ("RAID 5 — read more").
   Cheap once the pages exist; not part of this spec's first deliverable.
4. **Whether `raid-types.yaml` and `element-popups.yaml` retire** after their content migrates
   (§5.3). Valentina's call, later.

## 12. Out of scope

- A search box, comments, any runtime behaviour on the pages.
- Translating the content (roadmap item 8 — the data shape makes it a second `data/kb/` tree).
- The SEO work beyond "the text is in the HTML" (roadmap item 4 of 2026-09-05: sitemap,
  Search Console diagnosis, distribution) — it starts after §9.2 ships.

## 13. Where it touches the code

| piece | today | change |
|---|---|---|
| `data/kb/*.yaml` | — | new: one file per concept or term (§5.1) |
| `data/raid-levels/*.yaml` | prose fields unread | a `kb:` block (§5.2); `reference.capacityFormula` becomes a template |
| `data/intro.yaml` | the whole KB | the Map's spine; the four layers become terms |
| `.development/scripts/generate-kb.js` | — | new: the generator (§7), hooked into `04-docs-update`; `lib/kb-markdown.js` (the subset), `lib/capacity-template.js` (the evaluator) |
| `kb/*.html` | — | generated, tracked, served |
| `kb.html`, `kb.js` | runtime rendering | `kb.html` redirects to `kb/`; `kb.js` goes |
| `src/engine/model.js` | — | the write-parallelism fix (§6) |
| `tests/` | `raid-levels-data.test.js` | `kb-data.test.js`, the worked-calculation test, the generator test |
| `index.html` (later, item 2) | — | the icons read `data/kb` short forms |

## 14. Implementation notes (2026-09-06)

Written the same day, in one long session, with Valentina reading every page as a
learner. What the implementation decided differently from the sections above, so that
the spec still describes what exists:

- **One page per concept, not one concepts page (§2).** `kb/concepts.html` was built
  first and read as one long scroll where the concepts seemed to follow from one another,
  and where a reader coming back after a pause had lost the title. Every concept is now
  `kb/<id>.html`; the map is the index; the glossary stays. 31 pages: map, glossary,
  24 concepts, 5 levels.
- **The map's order** is layers → levels → concepts (§2 said concepts before levels).
- **The layout uses the width for structure, not for longer lines.** From 1100px the
  map stands beside the text as three native `<details>` groups (layers, levels,
  concepts), the group holding the current page open; from 1400px a right column lists
  the page's own sections; the reading column keeps a 72-character measure. Links take
  the accent colour; the body is larger than the sandbox's. A footer carries the site's
  navigation, on the sandbox page too.
- **`[[id]]` renders as typed** (hyphens as spaces), `[[id|text]]` overrides — the
  entry's `name` is used only where a link stands alone. Ids stay readable slugs.
- **`sources` is `ref` + `note` + `url`** where a public source exists (107 of 114):
  `ref` names the thing and is the link, `note` is what was taken from it; the man
  pages, the kernel files, the 1988 paper, Anvin's RAID-6 paper, Microsoft Learn, the
  MegaRAID guide, Intel's notes, US-CERT; project files with relative links. Plain
  strings where there is no public source.
- **`status: to-verify` means at least one sentence unchecked**, not "no sources"
  (§5.1, §10 said the latter). Eight entries carry it: the four layers migrated from
  `intro.yaml`, the three physical actors, `raid-engine` (its RoC internals).
- **The level's `kb:` block** carries `worked` — the three derivation texts with
  `{N} {size} {capacity} {faultTolerance} {writePenaltyRandom} {writePenaltySequential}`
  filled from the engine on `example` — and `reference:` gains `capacityTemplate`, the
  formula in an evaluable grammar (numbers, `N`, `size`, `copies`, `+ - * /`) that
  `kb-worked.test.js` checks against `capacityGB` (§6). The engine exposes
  `performance().writePenaltySequential` for the same reason.
- **The engine changed where the pages contradicted it (§6):** a mirror's write
  parallelism is one copy's width, and its write penalty is the copy count times one
  copy's own — a pair 2, a three-way mirror 3, a mirror of RAID 5 spans 2 × 4. RAID 0+1
  writes like RAID 1+0 and satisfies the `database` challenge (recorded in
  `challenge.test.js`); RAID 6 @3 pays 3. `tech-debt/mirror-of-stripes-write-parallelism.md`
  resolved; domain-model spec §4b updated.
- **§9 progress**: 9.1 and 9.2 done (24 concepts, levels 0/1/5/6/10). 9.5 partly done
  already: `write-hole`, `scrubbing`, `raid-is-not-a-backup` and `rebuild` are entries;
  why parity rotates is in `parity` and `algorithm`; degraded-mode performance in
  `performance`. Left: 9.3 (1E, 1+0, 0+1, 50, 60, 51, 61, 100, JBOD) and 9.4
  (components). RAID 4 has no level file: it is `striped + parity1` with a fixed parity
  disk, i.e. a placement algorithm, and the recognizer names by shape — a model decision
  before a page.
- **§11 answered**: (1) a concept's `long` runs 250–1150 words, and the criterion is
  not length but completeness of the steps and plainness of the sentences (Valentina:
  "the effort must go to the concept, not to the sentence"; every actor named and
  linked, no metaphor carrying the meaning); (2) the markdown subset is the header of
  `data/kb/segmentation.yaml`; (3) the results panel link is still open; (4)
  `intro.yaml` still feeds the map's summary, its four layers are entries now —
  retirement of `raid-types.yaml` / `element-popups.yaml` still Valentina's call.
- **Found by the pages**: ten `pros`/`cons` items across six level files were YAML
  mappings (a `: ` mid-sentence) and printed as `[object Object]`; quoted, refused by
  the generator, checked by `kb-data.test.js`.
