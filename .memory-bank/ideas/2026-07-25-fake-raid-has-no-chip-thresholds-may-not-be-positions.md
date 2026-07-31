---
captured: 2026-07-25
status: promoted-to-adr
promoted_to: ../../.development/reference/decisions/001-engine-identity-not-position.md
promoted_at: 2026-07-30
context: "emerged in-browser while testing the graph-traversal recognizer (feature/engine-graph-traversal): Valentina questioned whether the fake-RAID chain engine → PCIe → CPU is physically true"
tags: [domain-model, ground-truth, derived-controller, teaching]
---

# Fake RAID has no chip, and the two thresholds may not be positions

## What came up

The proposed fake-RAID chain — disks → backplane → HBA → **engine** → PCIe → CPU → OS —
was questioned on physical grounds: *"I understood it as the CPU having a chip dedicated
to RAID, but on the CPU itself."*

Neither reading is quite right, and the correction matters more than the detail.

**There is no RAID silicon anywhere in fake RAID.** The parity is computed by the general
CPU running a driver — that is precisely what makes it *fake*: the hardware presents
itself as a RAID controller and computes nothing. So the "engine" in the fake position is
not a compute engine at all. It is **ownership of the array**: who holds the metadata
format, who exposes it to BIOS/UEFI so the machine can boot from it, who presents one
volume before the OS has loaded any driver.

That firmware sits in one of three real places:

1. **In the chipset** — Intel RST. The SATA controller with the RAID mode lives in the
   PCH, a chip separate from the CPU, attached over DMI (a PCIe-derived link). Here the
   game's `engine → PCIe → CPU` is an honest abstraction: the engine really is on the far
   side of a PCIe-like bus from the CPU.
2. **On an add-in card** — the cheap Marvell/JMicron "RAID" cards. Literally on the PCIe
   bus, exposing a BIOS ROM while the driver does the work. The game is literal here too.
3. **On the CPU/SoC die** — AMD Ryzen has the SATA controller on the SoC, and Intel has
   integrated progressively. Here "before the CPU" **has no answer**.

## Why it deserves attention

Case 3 undermines the open question the derived-controller work was going to close:
*"confirm that the discriminant is position relative to PCIe and OS (two thresholds,
three segments)"*. **PCIe is not a clean threshold** — when the controller is on the die,
the fake engine is neither before nor after it.

An alternative framing that survives all three cases, and is not a position at all:

|          | owns the array            | computes |
| -------- | ------------------------- | -------- |
| hardware | the controller            | the controller |
| fake     | firmware, before the OS   | the CPU  |
| software | the OS                    | the CPU  |

Two questions — *who owns the metadata* and *who does the maths* — with three coherent
answers. But this is no longer "position along a path", so it is a change of **shape**
against the spec, not a refinement of it. That decision is Valentina's.

Second, smaller point: in chipset fake RAID the **HBA and the engine are the same
silicon** — the PCH's SATA controller *is* the HBA and the RAID function lives inside it.
The game keeps them as two pieces in series. Defensible as teaching (it makes visible that
the engine is a *role*, not an object) but it should be a known simplification, not an
accident.

## Minimal next step

Decide the threshold question **before** writing the rule into
`.development/specs/planned/derived-controller.md` — position-based (PCIe/OS) or
question-based (ownership/computation). The traversal in `engine/graph.js` serves the
position reading with two opposite-direction reachability queries; the question-based
reading would need node-level facts instead, and much less graph.

Verify the hardware claims against a real source first: this was written from prior
knowledge, and the sandbox reaches only `kernel.org` and `raw.githubusercontent.com`. The
project's ground-truth discipline applies to layouts, but a claim about where firmware
lives deserves the same treatment before it becomes a rule.

## Related

- `.development/specs/planned/derived-controller.md` (the spec this feeds)
- `.development/tech-debt/physical-recognizer-does-not-walk-the-path.md` (Resolution
  section: order is still unverified, deferred to exactly this work)
- Handoff `2026-07-25-1502-…`, *Next* item 2, and the hardware verification note at the
  end of it: *"«engine» is the only true word in all three positions"*
