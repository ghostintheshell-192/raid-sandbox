# Informative UI — the map of what needs explaining

**Status:** PLANNED — this document is the *inventory*, not yet the design
**Date:** 2026-07-25
**Origin:** `.memory-bank/ideas/2026-07-25-informative-canvas-labels.md`

> Valentina's framing: *"prima dobbiamo identificare tutti i punti che ne necessitano,
> per poi poter capire qual è il modo migliore di inserirle."* So this file answers
> **what needs explaining and whether the text already exists** — deliberately stopping
> before deciding the visual channel.

## Audience

Two, and both matter:

- **absolute beginners** — no vocabulary at all; do not know what a span, a drive group
  or parity is;
- **the roughly-informed** — have an idea, are here to try things out.

Progressively suppressing the hints once the player no longer needs them makes sense as a
direction, but is explicitly **not now** — it is a separate feature, not a prerequisite.

## The data files are waiting, not orphaned

`data/raid-levels/*.yaml`, `data/algorithms/*.yaml`, `data/raid-types.yaml` and
`data/element-popups.yaml` are currently read by nobody. This is **by design**: they were
written to a standard shape so they could be loaded uniformly and wired in *gradually, once
a visually appropriate way to surface them existed*. The missing piece has always been the
channel, not the content.

## The inventory

Legend for **Source**: `✓ exists` = the explanatory text is already written in a data file ·
`~ derived` = the engine already computes it · `✗ missing` = neither.

### A. Palette (sidebar) — 27 chips, every one a bare name

| Element | What a player needs to know | Source |
|---|---|---|
| `SATA 2/4 TB`, `SAS 2 TB`, `NVMe 1 TB` | what the protocol changes; **NVMe bypasses the backplane** — a hard rule they currently discover only by breaking it | ✗ missing (the rule text exists in `validator.js`, the protocol explanation does not) |
| `Striped` / `Linear` | the founding pair of axis B: how data is split | ✗ missing |
| `None` / `Mirror` / `Parity P` / `Parity P+Q` | how data is protected; "Parity P+Q" is opaque to a beginner | partly ✓ (`element-popups.yaml` explains the P and Q *blocks*, not the choice) |
| `Left Sym` · `Left Asym` · `Right Sym` · `Right Asym` | the most technical labels in the whole UI | ✓ exists — `data/algorithms/*.yaml` (`description`, `pros`, `cons`, `convention`, `linuxConstant`) |
| `Near` · `Far` · `Offset` | idem, plus: they only exist under Linux software RAID | ✓ exists — `data/algorithms/raid10-*.yaml` + the cross-axis rule in `validator.js` |
| 10 physical components | what each does and what it needs on either side | ✓ exists — `data/components/*.yaml` (`description`, `provides`, `requires`, `constraints[].message`, `note`); the UI loads these files and reads only `ui:` + `name` |

### B. Canvas — data layer

| Element | What a player needs to know | Source |
|---|---|---|
| loose disk | protocol + size (shown), where it will route (not shown) | ~ derived (`_buildPhysicalAdapter` knows the route) |
| **array node** | *what it is* — no name, no ordinal, no recognized level shown on the node itself | ~ derived (`recognize()` runs on every node) · see `tech-debt/canvas-nodes-are-unnamed.md` |
| **a span inside a nested build** | that it *is* a RAID 5 (in a RAID 50, nothing ever says so — the panel names the root only) | ~ derived (the recognizer walks the whole tree; only the root's answer is displayed) |
| empty attribute slots | which choice is missing and what the choice means | partly ~ derived (`_firstIssue` says *what* is missing, never *why it matters*) |
| tap zones ("+ add a disk") | — (self-explanatory) | n/a |

### C. Canvas — physical layer

| Element | What a player needs to know | Source |
|---|---|---|
| component nodes | same as their palette chips | ✓ exists — `data/components/*.yaml` |
| ports / edges | what a connection means, why it is legal | partly ✓ (`ports[].type`, `requires`) |
| **the derived RAID type** (hardware/software/fake) | **why** it is that type — engine placement *is* the type, the central insight of axis A (§2) | ~ derived (`_recognizePhysicalLayer` computes it; the badge shows the verdict, never the reason) |

### D. Results panel

| Element | What a player needs to know | Source |
|---|---|---|
| **RAID level** | why it is that level | ~ derived — `recognize()` returns `reason` on **every** call, and `index.html:277` uses it **only when recognition fails**: `elLevel.textContent = a.level ?? \`non-standard (${a.reason})\``. On success the explanation is computed and discarded |
| Capacity | how it is computed | ✓ exists — `element-popups.yaml: capacity-formula` · per-level formula in `raid-levels/*.yaml: capacityFormula` |
| Fault tolerance | what "±1 disk failure" guarantees | ✓ exists — `element-popups.yaml: fault-tolerance` |
| Performance read / write | what the class means, why writes cost more | ✓ exists — `element-popups.yaml: read-perf`, `write-perf` · `raid-levels/*.yaml: writePenalty` |
| violations | **which node** each message is about | ~ derived — every violation now carries a real `nodeId` and a structural subject ("Span 2"); nothing consumes it yet |
| Placement grid — `D0…Dn` headers | that a column is a disk | ✗ missing (trivial) |
| Placement grid — cells | what a data / mirror / P / Q block is | ✓ exists — `element-popups.yaml: block-data-stripe`, `block-mirror`, `block-parity`, `block-parity2` |

**`element-popups.yaml` maps 1:1 onto this panel**: its 8 entries are exactly the 4 cell
roles and the 4 statistics. It was written for this target, and the target still exists
unchanged.

### E. Challenge mode

| Element | What a player needs to know | Source |
|---|---|---|
| requirements checklist | which metric each line grades | ~ derived (the requirement vocabulary is fixed, §11a) |
| hint / win banner | — | ✓ exists (challenge YAML) |

## What this inventory says

1. **The explanatory content mostly exists.** The genuine gaps are few and specific:
   segmentation, redundancy, the disk protocols, and the structural terms (span, drive
   group, virtual drive) — the vocabulary of what the player *builds*, which is precisely
   the vocabulary the game teaches by making them compose it.
2. **The second-largest source is not the YAML files, it is the engine.** Level `reason`,
   per-node recognition, the physical-type derivation and the violation subjects are all
   computed already and thrown away. Wiring those costs no new prose and cannot drift from
   the model — it *is* the model.
3. **One rule needs settling before any text is written**: when a concept is described in
   more than one place (`raid-levels/raid5.yaml`, `raid-types.yaml`, `intro.yaml`), which
   one is authoritative? Today they cannot contradict each other because two of the three
   are unread. Turning them on makes divergence possible, and a caption contradicting the
   panel is worse than no caption. See `tech-debt/capacity-approximate-on-mixed-disks.md`
   for the shape of that failure.
   **Update 2026-09-02**: settled for three concepts — `raid-levels/*.yaml` is now the
   authority for a level's *shape*, *name*, *minimum disk count* and the recognizer's
   one-line *reason*, because the engine reads them there (spec §5c). Prose fields
   (description, pros/cons, formulas) are still unread, and the open question stands
   for them and for `raid-types.yaml` / `intro.yaml`.

## Decided so far

- **Violation → canvas link**: hovering a message lights up every element involved in it
  (Valentina, 2026-07-25). Natural with a mouse; on touch the same thing on tap. This is
  the first concrete channel, and it needs no new content — only the `nodeId` that already
  exists.

## Open questions (deliberately not decided here)

- How many channels, and which piece of information belongs to which. The risk of
  "too much" is not text length, it is the number of simultaneous signals per element.
- Whether an array shows its recognized level permanently, or only on demand.
- Which file is authoritative per concept (see point 3 above).
- Whether the physical-type badge should explain itself, given it is the central insight
  of axis A.
