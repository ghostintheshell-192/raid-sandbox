---
type: feature
priority: medium
status: open
discovered: 2026-09-04
related: []
related_decision: null
---

# The power-loss warning is promised in the data and was never written

## Problem

`data/components/os-linux.yaml` states:

> Without a battery-backed write cache (BBU) or UPS, a power loss during a write can
> leave the array in an inconsistent state. **This is a soft constraint surfaced as a
> warning in the game.**

No such rule exists. The validator has seven and none concerns power.

## Analysis

The constraint was planned from the start — spec §5a lists `os-linux` / `os-windows` with
"needs UPS" — and never implemented.

What it describes is the **write hole**: a stripe and its parity updated non-atomically,
interrupted by power loss, leaving the array internally inconsistent in a way a later
rebuild silently propagates. It is the reason a hardware RAID controller carries a
protected cache, and therefore the reason the expensive object in the physical layer is
expensive. The game already models that cache as part of what makes a RoC a RoC
(ADR-001); it never says what the cache protects against.

So this is not only a missing warning. It is the missing explanation of a component the
game already asks the player to choose.

## Possible Solutions

- **Option A**: a soft rule firing on software RAID (parity redundancy, no protected
  cache in the path). Cheap, but it teaches the fact only where the player is already
  most likely to be an advanced user.
- **Option B**: A, plus surface the positive side on the RoC — the protected cache
  becomes visible as *what this object buys you*, not just a line in a description.
- **Option C**: model a UPS / BBU component the player can place, making the mitigation
  buildable rather than described.

## Recommended Approach

**Option A first, B when the info channel exists** (roadmap item 2). Option C adds a
mandatory-feeling node to every build for one lesson; worth reconsidering only if the
physical axis gets richer.

Ground-truth note: how md handles this (bitmap, journal, `--consistency-policy`) should be
checked against the kernel source before the message states specifics. The general
mechanism is safe to state; the mdadm particulars are not, yet.

## Notes

The rule is expressible today: the derived physical view already carries `raidType` and
`os`, which is all the predicate needs.

## Related Documentation

- **Census**: `reference/unspoken-content.md` — "Two promises the data makes"
- **Spec**: domain-model §5a ("needs UPS"), §6 (constraint vocabulary)
- **Decision**: `reference/decisions/001-engine-identity-not-position.md` (the RoC's protected cache)
- **Code Locations**: `data/components/os-linux.yaml`, `src/engine/validator.js` (RULES)
