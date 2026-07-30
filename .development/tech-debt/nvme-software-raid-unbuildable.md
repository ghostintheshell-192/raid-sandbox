---
type: bug
priority: medium
status: resolved
discovered: 2026-07-30
resolved: 2026-07-30
related: [physical-recognizer-does-not-walk-the-path.md]
related_decision: ../reference/decisions/001-engine-identity-not-position.md
---

# All-NVMe software RAID cannot be built — the recognizer demands an HBA the spec forbids

## Problem

Spec §2 declares, as a hard rule, that NVMe bypasses the backplane and the controller:
the drive speaks PCIe natively, `cpAutoRoute` wires it straight to the PCIe node, and
`nvme-backplane` guards the routing. But `_recognizePhysicalLayer` refuses any verdict
until an HBA sits between the disks and the engine — unconditionally, for every
protocol. An all-NVMe build (disks → PCIe → CPU → OS, engine placed) is therefore
refused with *"Route the disks through an HBA before the RAID Engine"* — instructing the
player to build exactly what the spec says NVMe must not have.

mdadm or ZFS over plain NVMe drives, no HBA anywhere, is the most common real-world
software-RAID configuration today. The game contradicts its own spec, not just reality.

## Analysis

The `hbaOnPath` gate in `src/sandbox/canvas-state.js` (`_recognizePhysicalLayer`, engine
branch) was written for the SATA/SAS chain, where "something must carry the disks to the
engine" is true and teachable. It never learned that the NVMe path has no HBA by design.
The two rules are individually correct and jointly unsatisfiable for NVMe.

## Possible Solutions

- **Option A**: scope the HBA requirement by protocol — require an HBA upstream only for
  disks whose protocol is SATA/SAS; NVMe disks satisfy the path check by reaching the
  engine over PCIe. Matches the spec as written.
- **Option B**: drop the HBA requirement entirely and let port compatibility carry the
  burden. Rejected: for SATA/SAS the requirement is real and is one of the few ordering
  facts the recognizer states.

## Recommended Approach

Option A, folded into the ADR-001 implementation branch — the engine branch of the
recognizer is being rewritten there anyway (engine identity instead of the engine→OS
edge), so the protocol-scoped HBA rule lands in the same pass. Noted in ADR-001,
Consequences/Pros.

## Resolution

Option A, landed with the ADR-001 implementation (`feature/derived-controller`): the
HBA-in-path gate in `_recognizePhysicalLayer` (`hbaGateFor`) is now scoped to disks whose
protocol is not NVMe. An all-NVMe build (disks → PCIe → CPU → OS, no HBA, no engine node
— the OS is the engine) resolves to Software RAID; SATA/SAS builds still require the HBA
on the path. Covered by `tests/canvas-state.test.js` ("NVMe-only software RAID no longer
requires an HBA").

## Notes

Found during the physical-model fidelity audit
(`.development/reference/physical-model-fidelity.md`, §1.1) — the only finding classified
as an internal contradiction rather than an undeclared simplification.

## Related Documentation

- **Architecture Decision**: `reference/decisions/001-engine-identity-not-position.md`
- **Spec**: `.development/specs/implemented/raid-sandbox-domain-model.md` §2 (NVMe bypass)
- **Code Locations**: `src/sandbox/canvas-state.js` (`_recognizePhysicalLayer`, the
  `hbaOnPath` gate), `src/engine/validator.js` (`checkNvmeBackplane`)
