# The controller is derived, not dragged

**Status:** PLANNED — design agreed 2026-07-25, not implemented
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

- **Is "which side of the PCIe bus" the right discriminator** between hardware and fake?
  It matches the diagram and is crisp to check, but it should be confirmed against the
  source notes before it becomes the rule.
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
