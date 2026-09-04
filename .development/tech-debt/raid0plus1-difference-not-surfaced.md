---
type: feature
priority: medium
status: resolved
discovered: 2026-09-04
related: []
related_decision: ../reference/decisions/002-the-engine-holds-no-domain-facts.md
---

# RAID 0+1 is recognized so the sandbox can say it is worse — and the sandbox never says it

> **Resolved 2026-09-05** on `feat/raid0plus1-soft-rule`, by Option A as recommended.
> See "Solution Implemented" at the end.

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

## Solution Implemented

Option A, generic rather than special-cased (ADR-002): `validator.js` gained one new
rule, `level-advisory` (soft, layer `data`) — it asks `ctx.levels.match(node)` for the
array's recognized level and, if that level's own file declares an `advisory` string,
fires it with `{label}` filled in (same convention as `reasonFor`'s `{n}`). The rule
names no level; it only asks "does the level I just recognized have something to say
about itself".

`raid0plus1.yaml` is the first (and so far only) file with an `advisory:` field. Adding
one to another level is a data change, zero engine lines — the acceptance test ADR-002
names.

`levels.js` validates `advisory` as an optional string; `types.js`'s `LevelDef` gained
the field; `tests/fixtures/raid-levels.js` mirrors the exact YAML text and
`raid-levels-data.test.js` now includes `advisory` in the YAML/fixture alignment check.

## Testing

`tests/validator.test.js` [1b]: a RAID 0+1 build fires `level-advisory` once with the
filled sentence; a RAID 1+0 build (same disks, right nesting) does not; a level with no
advisory (RAID 5) fires nothing; the rule is registered soft/data.
