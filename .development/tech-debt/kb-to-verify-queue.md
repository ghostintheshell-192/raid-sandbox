---
type: code-quality
priority: medium
status: open
discovered: 2026-09-07
related: []
related_decision: reference/decisions/004-every-statement-names-its-source.md
---

# The knowledge base's to-verify queue: eight pages, each with its reading

## Problem

Eight knowledge-base pages carry `status: to-verify` — the page says so under its
heading — meaning at least one sentence has not been checked against a primary
source. ADR-004 makes the state a queue, not a category of truth: every item has a
destination (*cited*, *derived*, *chosen*, or removal). This note is the queue.

## Analysis

Four are the physical actors, written 2026-09-06 on the same basis as ADR-001's
hardware claims, which that ADR's Cons mark "not yet verified against a primary
source". Four are the storage layers migrated from the old `intro.yaml`, whose text
had no sources of its own.

| page | what needs a source | where to read |
|---|---|---|
| `raid-engine` | the three cases; where RST firmware lives, what add-in chips do, SoC integration | `reference/adr-001-hardware-claims-sources.md` (Intel RST whitepaper, dmraid readme, AMD RAIDXpert2 guide); the Broadcom MegaRAID guide, already in the bibliography |
| `hba` | HBA vs RAID controller; an HBA alone cannot host the engine | Broadcom MegaRAID / HBA documentation (IT mode vs IR mode) |
| `bbu` | what protects the write cache; the replay that closes the write hole | Broadcom CacheVault and BBU documentation |
| `backplane` | passive mid-plane, SATA/SAS signal routing, SGPIO/SES | T10 SES, SFF-8485; a Supermicro backplane manual |
| `physical-disks` | the SATA/SAS path and NVMe on PCIe, as stated | the same as above plus `md(4)`; IBM Redbooks as the generic reference |
| `drive-group` | the second layer as MegaRAID names it | Broadcom MegaRAID guide (drive groups, virtual drives) |
| `virtual-drive` | the device the array becomes, per family | MegaRAID guide; `md(4)`; Microsoft Learn (storage spaces) |
| `span` | spans across drive groups | MegaRAID guide (spanned drive groups) |

The Ryzen finding in the ADR-001 reading list — some SATA ports from the CPU die,
others from a separate chipset die — is an open item on ADR-001's own wording, to
settle while reading for `raid-engine`.

## Possible Solutions

- **Option A**: read each source, cite what it says, set `status: cited`, and remove
  any sentence no source supports — one page per sitting.
- **Option B**: leave the mark. Honest, but the ADR says the state is temporary.

## Recommended Approach

Option A, one page at a time, `raid-engine` first (its reading list already exists).

## Notes

`kb-data.test.js` allows only `cited`, `derived`, `to-verify`; the generator prints
the mark and links the *how the pages are sourced* chapter of `design-decisions`.

## Related Documentation

- **Architecture Decision**: [ADR-004](../reference/decisions/004-every-statement-names-its-source.md)
- **Reading list**: [`reference/adr-001-hardware-claims-sources.md`](../reference/adr-001-hardware-claims-sources.md)
- **Code Locations**: `data/kb/{raid-engine,hba,bbu,backplane,physical-disks,drive-group,virtual-drive,span}.yaml`

---

📍 **Investigation Note**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) to locate relevant files and understand the architectural context before starting your analysis.
