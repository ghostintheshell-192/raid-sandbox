---
type: bug
priority: medium
status: open
discovered: 2026-07-31
related: [nvme-software-raid-unbuildable.md, ../reference/physical-model-fidelity.md]
related_decision: ../reference/decisions/001-engine-identity-not-position.md
---

# NVMe disks can never reach `engine-roc` — Hardware RAID over NVMe is unbuildable

## Problem

`engine-roc.in` (the RAID-on-Chip engine's only input port) is typed `routing`. The
only port in the system that outputs `routing` is `backplane.out`. But
`_diskTargetComponent` (`src/sandbox/canvas-state.js`) auto-routes NVMe disks
*exclusively* to a `pcie` node — never to a `backplane` — because NVMe speaks PCIe
natively and bypasses the backplane by design (the same fact `nvme-software-raid-
unbuildable.md` and `pcie-bus.yaml`'s note both state).

The two facts compose into a dead end: there is no sequence of components a player can
place that lets an NVMe disk's auto-routed edge ever terminate at `engine-roc.in`.
Hardware RAID (RoC) over NVMe disks — a real configuration (tri-mode HBA/RoC cards
exist precisely to bridge NVMe into a hardware array) — cannot be built in the sandbox
at all, for any wiring.

This is a topological fact, confirmed by reading the port-type tables
(`COMPATIBLE` in `physical-controller.js`, `engine-roc.yaml`, `backplane.yaml`), not
requiring in-browser reproduction to establish that the path is absent — though the
exact UX when a player tries (silently no valid drop target vs. some other symptom) is
still unverified.

## Analysis

Symmetric to `nvme-software-raid-unbuildable.md`, but on the opposite side of the same
cause: there, the recognizer demanded an HBA that NVMe's spec-mandated bypass made
unreachable; here, `engine-roc`'s `routing`-typed input demands a backplane that NVMe's
same bypass never wires through. Both are the NVMe-bypass rule colliding with a
component that was modeled against the SATA/SAS chain and never re-checked against it.

`engine-metadata` does not have this problem: its input is `pcie`-typed, fed by
`hba.out` (`pcie`) — and NVMe disks, while they don't route through `hba` either,
reach `pcie` directly, which is `engine-metadata`'s own input type. So Fake RAID over
NVMe is buildable (SATA/SAS-style, `disk → hba → engine-metadata`, or NVMe direct
`disk → pcie-node → engine-metadata` if that edge exists — unverified, worth checking
together with the browser pass on the fake branch). Hardware RAID is the one branch
structurally closed to NVMe.

## Possible Solutions

- **Option A**: give `engine-roc` a second, `pcie`-typed input (or make its declared
  input accept both `routing` and `pcie`), modeling a tri-mode RoC card that can ingest
  either a SAS/SATA backplane or a PCIe/NVMe fabric. Matches real tri-mode controllers
  (Broadcom Tri-Mode, etc.) but changes what `engine-roc` represents — no longer a pure
  RoC-behind-a-backplane story.
- **Option B**: document the gap and leave it unbuildable, the same way the sandbox
  already accepts that some real configurations are out of scope for v1. Cheaper, but
  loses a real and increasingly common configuration (NVMe hardware RAID is what
  tri-mode cards exist for).
- **Option C**: introduce a distinct tri-mode engine component (a third engine
  identity) instead of widening `engine-roc`. Keeps each engine object single-purpose
  and extends, rather than bends, ADR-001's own reasoning: "they *are* two objects — a
  MegaRAID card and a JMicron chip are distinct products, not one product in two
  positions" (ADR-001, Rationale). A tri-mode controller (e.g. Broadcom Tri-Mode 9600)
  is a third, distinct purchasable product family — not a variant of the RoC family —
  so under that same logic it earns its own piece rather than a second port bolted onto
  `engine-roc`.

## Recommended Approach

**Option C, per Valentina's call (2026-07-31)**: a distinct tri-mode engine component,
not a widened `engine-roc`. Her reasoning: to stay consistent with the modeling
principle already in play — one component per real-world *family* of RAID-engine
device (the metadata-only family → `engine-metadata`, the RoC family → `engine-roc`) —
a third family (tri-mode) gets a third component, the same way the first two did.
Widening `engine-roc` (the rejected Option A) would have made one object represent two
different product families, which is the exact pattern ADR-001 argued against when it
rejected a single generic engine piece with a selectable property.

Still needs its own scoped design pass before implementation — at minimum: the
component's id/name, whether its badge names "tri-mode" outright or stays silent (the
RoC piece deliberately avoids naming the verdict), what `pathIssueFor` says for a third
engine kind sharing the branch logic `rocIds.length` currently owns alone, and how the
`raidType: 'hardware'` verdict's `reason` text should read when the engine reached is
the tri-mode piece rather than the RoC. Not implemented yet; this is the direction, not
a finished design.

## Notes

Found while planning the in-browser hardware/fake branch testing pass that followed
ADR-001's implementation (`feature/derived-controller`, merged in PR #14). Confirmed by
static analysis of the port-type tables before any browser reproduction — see Problem.

**This finding duplicates an existing decision.** `reference/physical-model-fidelity.md`
§4 already caught this exact gap on 2026-07-30 and recorded it as an *accepted*
omission ("acceptable omission for the consumer-hardware scope"). This tech-debt note
and that audit line were not cross-checked against each other before this note was
written — a process gap in its own right, raised by Valentina during today's session.
The audit line now points back here as reopened; treat this file, not that one, as the
live status for this specific question going forward.

## Related Documentation

- **Tech debt**: `nvme-software-raid-unbuildable.md` (the sibling case — NVMe vs. the
  HBA gate, resolved by scoping the gate to non-NVMe)
- **Architecture Decision**: `reference/decisions/001-engine-identity-not-position.md`
- **Code Locations**: `src/sandbox/canvas-state.js` (`_diskTargetComponent`,
  `cpAutoRoute`), `data/components/engine-roc.yaml` (`in` port, type `routing`),
  `data/components/backplane.yaml` (`out` port, type `routing` — the only source),
  `src/sandbox/physical-controller.js` (`COMPATIBLE` port-type table)

---

📍 **Investigation Note**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) to locate relevant files and understand the architectural context before starting your analysis.
