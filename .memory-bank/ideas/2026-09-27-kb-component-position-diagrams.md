---
captured: 2026-09-27
status: promoted-to-spec
promoted_to: ../../.development/specs/planned/kb-position-diagrams.md
promoted_at: 2026-09-27
context: "KB verification of bbu (branch docs/kb-verify-bbu); Valentina asked for an image showing where the BBU sits physically"
tags: [kb, diagrams, svg, seo, physical-layer]
---

# Diagrams of where each physical component sits

## The idea

Each knowledge-base page of a physical component (`physical-disks`, `backplane`,
`hba`, `raid-engine`, `bbu`) shows where that component sits in a real machine,
on the storage path from the disks up to the operating system: disks in their
bays, backplane, cable, controller card (HBA, RAID-on-Chip, cache, BBU or
CacheVault), PCIe slot, CPU and operating system.

**Three diagrams, one per engine type**: hardware, firmware (fake) and software
RAID. A component can sit in different places, or be absent, depending on the
type, so one drawing would force a choice. Every component page shows all three,
with its own component highlighted and the rest in grey, and a note that some
vendors build things slightly differently (e.g. the CacheVault supercapacitor can
sit on a remote mounting board in a free PCIe slot, per Broadcom's product brief).

A component missing from a diagram is information too: on the `bbu` page, the
software RAID diagram has no protected cache, which is the point of the section
*Completing the interrupted writes*.

## Why it deserves attention

- The knowledge base has no images yet; a learner meeting "backplane" or "HBA"
  cold has nothing to place them against.
- SEO: Google Images indexes SVG served as its own file (`<img src="….svg"
  alt="…">`), not SVG inlined in the HTML. To verify against Google's image
  guidelines before relying on it.

## Shape, as discussed

- **Generated, not hand-drawn per page.** One SVG source per engine type in
  `data/`, every component with an `id`; each KB entry names the component to
  highlight; the generator writes `kb/img/<page>-<type>.svg`. The drawing is a
  domain fact, so it lives in the data (ADR-002), and a correction is made once.
- **Every block says what it is.** Each figure gets a caption that says which
  engine type it shows and how to read it, and a descriptive `alt`.
- **The drawing makes statements** (ADR-004): each placement needs a source, and
  the caption says the drawing shows the typical case.

## Open questions

- **Style**: like the components of the sandbox's physical canvas, so the reader
  recognises the pieces when moving to the game, or a neutral technical
  schematic, as in vendor manuals?
- The logical layers (`drive-group`, `span`, `virtual-drive`) have no physical
  place: a second family of diagrams (a stack of layers), later.

## Minimal next step

After the to-verify queue has done `hba`, `backplane` and `physical-disks`, so the
placements rest on verified sources: write a spec in `.development/specs/planned/`
with the three component lists (which components each engine type has, and
where), then draw the hardware diagram first.
