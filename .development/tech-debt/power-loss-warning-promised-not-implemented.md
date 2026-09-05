---
type: feature
priority: medium
status: resolved
discovered: 2026-09-04
related: []
related_decision: null
---

# The power-loss warning is promised in the data and was never written

> **Resolved 2026-09-05** on `feat/write-hole-warning` (Option A) — see the resolution
> section at the end. Option B (the positive side, surfaced on the RoC) still waits for
> the info channel, roadmap item 2.

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

## Resolution (2026-09-05)

Option A, written the way the validator now works (ADR-002): the rule is a comparison and
holds no sentence, no component id and no level name.

- **`validator.js` gains `write-hole`** (soft, layer `cross`, source
  `domain-model §5a/§6 (md raid5-ppl.c)`). It fires when the path is determined
  (`physical.raidType` set), the tree contains a `parity1`/`parity2` node, and the engine
  on the path (`physical.engineComponentId`) does **not** provide `power-loss-protection`.
  One violation per build, `nodeId: null` — the exposure belongs to the path, not to a
  span, so a RAID 50 does not repeat the paragraph twice.
- **The capability, both ways round.** `engine-roc.yaml` and `engine-roc-trimode.yaml`
  claim `power-loss-protection` in `provides:` (the protected cache ADR-001 already counts
  as part of what makes a RoC a RoC). The three engines that cannot protect a write —
  `os-linux`, `os-windows`, `engine-metadata` — each carry their own `writeHole.reason`,
  filled in with `{raidType}` by the validator's `fill()`. Putting the sentence on the
  component the rule fires *for* is what lets Linux mention md's journal and PPL while the
  metadata chip talks about having no cache to protect and Windows says neither.
- **`os-linux.yaml`'s `note:` is gone**, not edited: the prose that promised a warning is
  now the field that delivers it, so the fact is written once.
- **Guards.** `components-data.test.js` §6 checks the exclusive-or on the data — every
  `raid-engine` component either claims the capability or declares a `writeHole.reason`
  over 20 characters, never both and never neither, and a `writeHole` on a non-engine is
  refused as dead text. `validator.test.js` §3b covers the rest: the sentence per engine,
  RoC and tri-mode silent, RAID 1/10/0 silent, RAID 50 once, undetermined path silent, no
  catalogue → stands down.

**Ground truth** (`drivers/md/`, fetched from torvalds/linux master 2026-09-05):
`raid5-ppl.c` line 3 — *"Partial Parity Log for closing the RAID5 write hole"* — and line
52, entries *"mark the stripes for which parity should be recalculated after an unclean
shutdown"*. It is a parity problem: `raid1.c` lists `MD_HAS_PPL` and `MD_HAS_JOURNAL` in
`UNSUPPORTED_MDDEV_FLAGS`, so a mirror gets neither; its consistency policy is the
write-intent bitmap (`md.c` `consistency_policy_show` → journal / ppl / bitmap / resync /
none). PPL itself is RAID 5 only (`ppl_init_log`: `if (mddev->level != 5)`), while a
journal device serves the whole raid4/5/6 personality — which is why the Linux sentence
says *"a journal device, or … --consistency-policy=ppl on RAID 5"* and not the reverse.

**What was deliberately not claimed**: nothing about Windows Storage Spaces' own crash
consistency (no verified source), and the RoC's capability is documented in
`engine-roc.yaml` as the game's model of a RoC, not as a promise that every real
controller ships with the battery module fitted.

Option C (a placeable UPS/BBU component) stays rejected for the reason already recorded.

## Related Documentation

- **Census**: `reference/unspoken-content.md` — "Two promises the data makes"
- **Spec**: domain-model §5a ("needs UPS"), §6 (constraint vocabulary)
- **Decision**: `reference/decisions/001-engine-identity-not-position.md` (the RoC's protected cache)
- **Code Locations**: `data/components/os-linux.yaml`, `src/engine/validator.js` (RULES)
