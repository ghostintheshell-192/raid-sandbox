# ADR-001: The RAID engine's type comes from which object it is, not where it sits

**Date**: 2026-07-30
**Status**: Accepted
**Impact**: high
**Summary**: Hardware vs. fake RAID is decided by which of two distinct engine objects sits on the control path (compute silicon vs. metadata-only chip), not by the engine's position relative to the PCIe bus; software RAID is the configuration where neither is present.

## Context

Axis A must derive hardware / fake / software from what the player builds, the same way
axis B derives the RAID level from the composed tree (founding principle, domain-model
spec §1). A draggable piece named "Hardware RAID Controller" violates that: dropping it
*selects* the answer.

The first design that removed it (`specs/planned/derived-controller.md`) read the type
from **position**: one generic engine piece, and the segment of the control path it sits
in decides the type — before the PCIe bus → hardware, between the bus and the CPU → fake,
inside the OS → software.

That reading fails on physical grounds, in the common case and not only at the edge:

- A hardware RAID card (e.g. Broadcom MegaRAID — a RAID-on-Chip with its own processor,
  protected cache, XOR/Galois accelerator) and a cheap fake-RAID add-in card (e.g.
  JMicron/ASMedia — metadata plus a boot-time Option ROM, while an OS driver computes on
  the general CPU) occupy the **same PCIe slot, in the same position in the wiring**.
  Position cannot separate two things that are not positionally different.
- On SoC-integrated controllers (AMD Ryzen SATA), the fake-RAID firmware and the CPU live
  on the same die: "before or after the PCIe bus" has no answer at all.

What actually distinguishes the three types is invisible to a wiring diagram: **who owns
the array metadata, and who computes the layout**. Hardware — the controller owns it and
computes it. Fake — firmware owns it (which is what makes the array bootable before any
driver loads), the CPU computes it. Software — the OS owns it and computes it.

## Decision

1. **Two distinct engine pieces**, each modelling a real, purchasable object:
   - **RAID-on-Chip** (`controller-hw.yaml`, kept and renamed): dedicated compute
     silicon. On a valid disks→OS path (HBA upstream, reaches an OS node — the walk
     `_recognizePhysicalLayer` already performs) → **hardware RAID**.
   - **Metadata-only chip** (`fake-raid-chip.yaml`, promoted from draft, renamed):
     metadata and boot firmware, no compute silicon. Same path check → **fake RAID**.
2. **Software RAID is the absence of both**: the HBA reaches an OS node directly, and the
   OS itself provides the engine (`provides: raid-engine` in `os-linux.yaml` /
   `os-windows.yaml`). No discrete node stands in for "the OS computes it".
3. **`raid-engine.yaml` is retired.** The generic, `any`-port, position-derived piece was
   the data-file scaffold of the positional reading this ADR replaces.
4. **`pcie-bus.yaml` stays as an illustrative node only** — without it the physical layer
   no longer depicts a real bus topology — but it carries no weight in the derivation.
   The recognizer never inspected it, before this decision or after.
5. **The `raidEnginePosition` / `derivedType` fields are removed** from all component
   YAMLs (`cpu.yaml`, `hba.yaml`, `os-linux.yaml`, `os-windows.yaml`, `pcie-bus.yaml`):
   they encode the abandoned positional reading.

## Rationale

- **Against position** (the superseded design): demonstrably false in the common case —
  see Context. A rule that is wrong about real products cannot be the model of reality
  the sandbox promises.
- **Against one generic piece with a selectable property** ("engine kind" as a field on a
  single node): filling in a field on a generic object is the "pick the answer" pattern
  relocated from the palette to a form. Nothing else in the sandbox derives a fact from a
  value chosen on a node — every derived fact comes from what is dragged and how it is
  wired.
- **For two objects**: they *are* two objects — a MegaRAID card and a JMicron chip are
  distinct products, not one product in two positions. The player identifies which object
  they have in hand, exactly as they already do choosing an NVMe versus a SATA disk. The
  type remains derived: the piece says *what it is*, the graph traversal says *whether it
  validly sits on the path* — identity carries the ownership/computation answers,
  reachability carries well-formedness. The position work (`engine/graph.js`) is not
  discarded; it keeps the job it was built for.

## Consequences

### Pros

- The model matches reality where the positional rule contradicted it; the sandbox stays
  a *model*, not a metaphor.
- The deeper lesson becomes teachable: hardware and fake RAID look **identical in the
  wiring** — that is precisely how fake RAID deceives buyers. The dashed-box /
  hover-highlight ideas from the spec survive unchanged and can carry this.
- `_recognizePhysicalLayer` changes less than the positional rule would have required:
  the on-path walk (disk reaches engine, engine reaches OS, HBA upstream) is already
  written and shared; only *which component ids count as the engine* changes. One
  correction rides along: the HBA-upstream requirement must apply to SATA/SAS paths
  only — today it is unconditional, which makes all-NVMe software RAID unbuildable
  (`tech-debt/nvme-software-raid-unbuildable.md`).
- Challenges do not reference component ids (verified when removing `controller-hw` was
  first considered), so no challenge breaks silently.
- Retiring the generic piece removes the last `any`-typed ports from the system: port
  typing becomes meaningful on every connection, and the escape hatch behind
  `tech-debt/control-path-tolerates-cycles.md` closes with it.

### Cons

- In chipset fake RAID the HBA and the metadata chip are the same silicon; the game keeps
  them as two pieces in series. Known simplification, accepted for teaching value (it
  makes visible that the engine is a role, not necessarily a separate device). A discrete
  chipset/PCH component would dissolve this (and give desktop SATA a faithful home) at
  the cost of one more mandatory node in every build — recorded as a future candidate,
  deliberately not pursued here.
- The badge text for the metadata-only chip is unresolved: "Fake RAID" is genuine
  industry terminology, but as a palette badge it hands the player the verdict before
  they build anything — the same flaw the RoC piece's badge already avoids.
- The hardware claims above (where RST firmware lives, what the add-in chips actually do,
  SoC integration) are written from prior knowledge and **not yet verified against a
  primary source**. The project's ground-truth discipline applies before implementation
  turns this into code.
- Builds made with the retired generic `raid-engine` piece lose their meaning and need
  the correct named piece instead.

## Update 2026-09-02 — the object declares its own verdict

Implemented one step further in the direction this ADR points: the discriminant is
still *which object* sits on the path, but the recognizer no longer knows the objects
by name. Each engine object's YAML carries a `verdict:` block (`raidType` + the
`reason` the panel shows), the OS files carry the software verdict for the case where
no engine object is on the path, and `src/engine/physical.js` reads those blocks off
the catalogue — any non-sink component with a `verdict:` is an engine object, in
catalogue order. The first consequence: the tri-mode controller
(`tech-debt/nvme-hardware-raid-unbuildable.md`, Option C) arrived as one file with no
engine change. The "hardware and fake look identical in the wiring" lesson is
unchanged; it is now also true of the code that tells them apart.
