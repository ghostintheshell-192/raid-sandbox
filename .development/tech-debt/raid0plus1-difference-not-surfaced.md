---
type: feature
priority: medium
status: open
discovered: 2026-09-04
related: []
related_decision: null
---

# RAID 0+1 is recognized so the sandbox can say it is worse — and the sandbox never says it

## Problem

`data/raid-levels/raid0plus1.yaml` states its own purpose twice:

> cons: *Strictly worse than RAID 1+0 at the same cost — **recognized so the sandbox can say so***
>
> note: *Recognized separately from RAID 1+0 because the two are often conflated and the
> difference (what a single failure takes down) is **exactly what the sandbox teaches**.*

The sandbox does not say so. A player who builds 0+1 sees nothing distinguishing it from
1+0.

## Analysis

The two levels are indistinguishable in every number the panel shows:

| | RAID 1+0 | RAID 0+1 |
|---|---|---|
| disks | 4 | 4 |
| usable capacity | 2 disks | 2 disks |
| `faultTolerance` | **1** | **1** |
| survives a *second* failure | 2 of 3 cases | 1 of 3 cases |

Both guarantee exactly one failure, so `faultTolerance` is 1 for both and it is correct.
What it hides is the failure *profile*: in 0+1 a dead disk takes its whole stripe leg with
it, so both remaining disks of the other leg are fatal; in 1+0 only the dead disk's mirror
partner is.

This is not a niche distinction. **Inverting span and drive group is precisely how a
player builds 0+1 while believing they built 10** — a documented, real mistake (it
happened to this project's author). The conceptual error produces a measurably worse
array and the game currently reports no difference at all.

## Possible Solutions

- **Option A**: a soft violation on 0+1 — "with the same disks, RAID 1+0 survives twice as
  many second-failure cases". Uses the mechanism that already works (accept and explain).
- **Option B**: a second derived number next to `faultTolerance` — survival probability, or
  "cases survived out of N" — which distinguishes the two without any special-casing, and
  would also separate other lookalike shapes.
- **Option C**: leave it to the info channel (roadmap item 2), where the level's own `cons`
  text becomes reachable and says it in the level's own words.

## Recommended Approach

**Option A now, Option B if the number proves useful elsewhere.** A is small, uses the
existing registry, and puts the sentence where the player already looks. B is more honest
as a model but it is a new derived quantity with its own ground-truth burden. C alone is
not enough: the player who most needs this is the one who does not know to click.

## Notes

The text to show is already written in the level file — this is a channel problem, not a
writing one.

## Related Documentation

- **Census**: `reference/unspoken-content.md` — "Two promises the data makes"
- **Spec**: domain-model §4 (recognition), §6 (constraint vocabulary)
- **Code Locations**: `data/raid-levels/raid0plus1.yaml`, `src/engine/validator.js`, `src/engine/model.js` (`failuresToKill`)
