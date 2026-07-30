# The controller is derived, not dragged

**Status:** IMPLEMENTED — `engine-roc` / `engine-metadata` landed on
`feature/derived-controller` (2026-07-30), not yet merged
**Amended:** 2026-07-30, see [ADR-001](../../reference/decisions/001-engine-identity-not-position.md)
and the "Update 2026-07-30" section below — the Hardware/Fake discriminant changed
**Origin:** the RIEPILOGO diagram (`.personal/IMG20260601163917.jpg`), re-read with its
author while wiring the self-explaining RAID-type badge
**Touches:** axis A (control path) — the physical layer's component model

## The contradiction this removes

The project's founding principle (spec §1):

> **The RAID level is not selected. It is derived from what you compose.**

Axis B honours it: you compose striping, mirroring, parity, and the engine *recognizes*
what you built. Axis A does not. Today `controller-hw` is a **draggable piece that picks
the answer**: drop it and the game says "Hardware RAID". The *type* is still chosen from a
list — the list is just made of components instead of level names. It is the abolished
quiz, wearing the sandbox's clothes.

The RIEPILOGO diagram never had a "hardware RAID" piece. It has **one RAID engine**, drawn
in three different places, and a dashed box around whatever that placement produces.

## The model, checked against the hardware

Confirmed with the author 2026-07-25; the corrections are recorded because they change the
wording, not the shape.

- **The RAID engine** is the thing that computes the layout. In **hardware** RAID it is
  silicon — a RoC (RAID-on-Chip): its own processor, protected cache, XOR/Galois
  accelerator. In **fake** RAID the chip exists (Intel RST lives in the PCH) but does not
  do the work: the driver computes on the CPU; the chip carries metadata and boot support.
  In **software** RAID there is no chip at all, only code. So the piece must be called
  **engine**, never *chip* — "engine" is the only word true in all three positions.
- **The controller** is the whole device: on a hardware RAID card the RoC, the cache and
  the HBA function are one board you buy and install. Integration is functional before it
  is about speed: the engine must sit on the data path to intercept every I/O, hold a
  power-loss-protected cache, rebuild autonomously, and present the OS a single virtual
  drive.
- **The HBA** bridges the host bus (PCIe) and the storage bus (SAS/SATA) — translation and
  routing, as the author remembered. Two refinements: it is **not necessarily a separate
  card** (in ordinary PCs the function sits in the chipset, the AHCI SATA controller), and
  **NVMe does not use one** — the disk speaks NVMe natively over PCIe, which is why the
  diagram's NVMe arrow bypasses everything and why the game already enforces
  `nvme-backplane` as a hard rule.

## What changes

> **Superseded 2026-07-30** — the position reading below (before/after the PCIe bus) does
> not hold: two real products (a hardware RAID card and a fake-RAID add-in chip) can sit
> in the identical slot and wiring position. See
> [ADR-001](../../reference/decisions/001-engine-identity-not-position.md) and the
> "Update 2026-07-30" section at the end of this document for the model that replaces it.
> Kept verbatim below as the record of the original reasoning.

**One engine piece. Three positions. The controller becomes an outcome.**

| the engine sits… | resulting type | the dashed box encloses |
|---|---|---|
| before the PCIe bus, with the HBA | **hardware** | engine + HBA — *this box is the controller card* |
| after the PCIe bus, next to the CPU | **fake** | HBA + the dedicated chip |
| in the OS | **software** | HBA + the OS-side engine |

The dashed box is not decoration: **it is the verdict, drawn**. Its colour is the type,
following the author's own study convention — blue for software, red for fake, solid black
for hardware. The player sees the outline form around what they built, the badge names it,
the sentence explains it: three registers, one fact.

This also answers "how do we highlight the other cases" — there is nothing else to invent.
It is the same box around a different set of pieces.

## Consequences to plan for

- `controller-hw` disappears as a component: palette chip, `data/components/controller-hw.yaml`,
  the hard-coded `COMPONENTS` table in `physical-controller.js`.
- `_recognizePhysicalLayer` currently decides `hardware` from the *presence* of that
  component. It would decide from **where the engine sits relative to the PCIe bus** —
  which is stricter and needs the path actually walked. This overlaps with
  `tech-debt/physical-recognizer-does-not-walk-the-path.md`; doing that first would make
  this cheaper.
- Rendering a box **around a set of nodes** is new: the physical canvas positions nodes
  absolutely, so the outline is a computed bounding box, redrawn on move. Not hard, but it
  is the first thing on that canvas that is not a node or an edge.
- Existing builds change meaning. Anything that got "Hardware RAID" by dropping a
  controller will need the engine placed. Challenges do not reference component ids
  (checked), so nothing there breaks silently.
- The naming question that started this dissolves: one piece, one name — **RAID Engine** —
  and *RAID Controller* becomes the label ON the dashed box, which is exactly the thing it
  names.

## Open questions

- ~~**Is "which side of the PCIe bus" the right discriminator** between hardware and fake?
  It matches the diagram and is crisp to check, but it should be confirmed against the
  source notes before it becomes the rule.~~ **SUPERSEDED 2026-07-30**: no — see
  [ADR-001](../../reference/decisions/001-engine-identity-not-position.md). The
  discriminant is which object the player places (RAID-on-Chip vs. metadata-only chip),
  not its position relative to PCIe.
- **Can the player still build a wrong physical path**, and what does the game say then?
  The box has no colour when the engine's position is undetermined — that is the honest
  state, and `controlPathIssue` already carries the message.
- **Does the box need to be draggable/collapsible?** A hardware controller is one object
  to the player; treating it as one thing to move may be worth it later, but it is not
  needed to make the point.

## Related

- `.development/specs/implemented/raid-sandbox-domain-model.md` §2 (axis A, the
  engine-position insight this makes visible), §1 (the founding principle)
- `.development/specs/planned/informative-ui.md` — same workstream: naming before rendering
- `.development/tech-debt/physical-recognizer-does-not-walk-the-path.md` — prerequisite in
  practice

## Update 2026-07-30 — engine identity, not position

Superseded by [ADR-001](../../reference/decisions/001-engine-identity-not-position.md).
The model below replaces "one engine, three positions" wherever the two disagree; the
rest of this document — the HBA description, the "controller becomes an outcome" framing,
the dashed-box-as-verdict rendering idea — is unaffected.

**Two engine objects, not one, and not a parameter on one:**

| piece | what it models | presence on a valid disks→OS path (HBA upstream, reaches an OS node — the check `_recognizePhysicalLayer` already performs) means |
|---|---|---|
| RAID-on-Chip (`controller-hw.yaml`, kept, renamed) | dedicated compute silicon — RoC, cache, XOR/Galois accelerator | **Hardware** |
| Metadata-only chip (`fake-raid-chip.yaml`, kept, renamed) | firmware + metadata, no compute silicon — Intel RST, cheap add-in chips | **Fake** |
| neither present, HBA reaches an OS node directly | the OS declares `provides: raid-engine` itself | **Software** |

`raid-engine.yaml` — the generic, `any`-port, position-derived piece — is retired: it was
the data-file scaffold for the position reading this update replaces.

`pcie-bus.yaml` stays as an **illustrative node only** — without it the physical layer
stops depicting an actual bus topology — but it carries no weight in the derivation,
before this update or after; the recognizer never inspected it.

The `raidEnginePosition` / `derivedType` fields on the surviving component YAMLs
(`cpu.yaml`, `hba.yaml`, `os-linux.yaml`, `os-windows.yaml`, `pcie-bus.yaml`) encode the
abandoned positional reading and are removed.

Still open: the final badge text for the metadata-only chip. "Fake RAID" (the current
draft badge in `fake-raid-chip.yaml`) is genuine industry terminology, but it still hands
the player the verdict before they build anything — same problem `controller-hw`'s badge
already avoided by saying "RAID Engine" instead of "Hardware RAID".

## Update 2026-07-30 — implemented, badge question resolved

Both pieces renamed and shipped: `controller-hw.yaml` → `data/components/engine-roc.yaml`
(`id: engine-roc`), `fake-raid-chip.yaml` promoted and renamed →
`data/components/engine-metadata.yaml` (`id: engine-metadata`). `raid-engine.yaml` removed.

The badge question above is resolved by making the point literal rather than picking a
new neutral word: **both pieces share the same label, "RAID Engine"**, distinguished only
by a small tag — badge `"RoC"` on one, `"metadata"` on the other (sidebar chips read "RAID
Engine (RoC)" / "RAID Engine (metadata)"). Hardware and fake RAID look the same in the
wiring; now they look the same in the palette too, and only the object's real identity —
not its position, not a verdict word — tells them apart. A `title=` tooltip on each sidebar
chip (drawn from the YAML `description:` field, previously unused — see
`data/components/engine-roc.yaml` / `engine-metadata.yaml`) gives the player the one fact
that legitimately differs: RoC has its own compute silicon, the metadata chip does not.

`_recognizePhysicalLayer` (`src/sandbox/canvas-state.js`) now branches on `engine-roc` /
`engine-metadata` presence, with software as the case where neither exists and the OS is
reached directly. The HBA-in-path gate is scoped to SATA/SAS disks, closing
`tech-debt/nvme-software-raid-unbuildable.md` in the same pass. Retiring `raid-engine.yaml`
also removed the system's last `any`-typed ports, closing
`tech-debt/control-path-tolerates-cycles.md` (the player can no longer wire a cycle through
the drag-and-drop UI at all — port typing forbids it structurally).

Not yet done: the hardware-claims verification against a primary source (ADR-001, Cons),
and the dashed-box/hover-highlight verdict rendering described earlier in this document —
that remains a separate, unscheduled piece of UI work.
