---
captured: 2026-09-25
status: open
context: "to-verify reading of the raid-engine KB page (docs/kb-verify-raid-engine), checking ADR-001's ASMedia example"
tags: [engine-identity, physical-model, adr-001, teaching-case]
---

# A hardware RAID engine behind the host port

**The idea.** ASMedia's ASM1092R is a SATA port multiplier with one host port and two
device ports. ASMedia describes it as doing "hardware RAID 0/1/JBOD/SPAN" with
"completely the free loading for the system CPU": the chip composes the array and the
host sees one disk. External RAID enclosures (USB or eSATA boxes with a RAID bridge)
follow the same pattern. The engine sits *after* the host controller, next to the disks,
not on a PCIe card.

**Why it deserves attention.** It is the cleanest illustration of ADR-001's lesson in
the other direction: a hardware engine in a position where the sandbox's current
components never put one. If the model can hold it, identity-not-position is shown, not
only stated. It probably cannot today: the physical catalogue has no component that
carries a RAID engine between the HBA and the disks.

**Minimal next step.** Check the physical catalogue (`data/components/`) and the
control-path graph for whether an engine object may sit downstream of an HBA port; if
not, write down what a "RAID bridge" component would need (ports, `verdict:` block,
what the OS sees). Source to start from: ASMedia's ASM1092R product page.
