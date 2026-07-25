---
type: bug
priority: medium
status: open
discovered: 2026-07-25
related: []
related_decision: null
---

# Usable capacity is approximate when an array mixes disk sizes

## Problem

`capacityGB` (`src/engine/model.js`) overstates usable capacity for a **parity** array
built on disks of different sizes. The panel shows a number the array cannot deliver.

Worked example — RAID 5 over 2 + 4 + 4 TB:

| | value |
|---|---|
| `capacityGB` → `sum(caps) - max(caps)` | 10 − 4 = **6 TB** |
| real array (every member coerced to the smallest) | (3 − 1) × 2 = **4 TB** |

The error is silent: nothing in the UI says the figure is an estimate. The
`mixed-disk-sizes` soft violation (added 2026-07-25) now warns that coercion happens,
but the capacity figure next to it is still the optimistic one.

## Analysis

The formula assumes equal-sized members — true for the common case, and the file says so
in a comment (`model.js`, above `capacityGB`: *"for mixed sizes the parity terms
approximate"*). This note exists so the caveat stops living only in a source comment.

Which redundancies are affected:

- `parity1` / `parity2` — **wrong** on mixed sizes (`sum - max` ≠ coercion to the smallest).
- `mirror`, linear (RAID 1 / mirror-of-arrays) — `Math.min(...caps)`, already correct.
- `mirror`, striped-disk (flat RAID 10/1E) — `sum/copies` is likewise optimistic on mixed
  disks; same class of error.
- `none` (RAID 0 / JBOD) — **correct as is**: md does not coerce, `create_strip_zones`
  (`drivers/md/raid0.c`) lays a first zone across all devices up to the smallest and
  further zones over the leftover of the larger ones, so the sum is genuinely usable.

## Possible Solutions

- **Option A**: coerce inside `capacityGB` — take `min(caps)` as the per-member size for
  the coercing redundancies (`mirror`, `parity1`, `parity2`) and keep `sum` for `none`.
  Exact and small; changes numbers the tests and the panel already assert, so it needs a
  pass over the existing capacity assertions.
- **Option B**: leave the formula, mark the figure as approximate in the UI when
  `mixed-disk-sizes` fires (e.g. "~6 TB"). Cheap, honest, but keeps a wrong number on screen.
- **Option C**: do nothing. The soft violation at least tells the player coercion happens.

## Recommended Approach

**Option A.** The project's whole premise is that what it shows is *true*; an approximation
that only bites on a build the player can trivially make (drag a 2 TB and a 4 TB disk into
one RAID 5) is worth an exact formula. Do it as its own change, with the capacity
assertions reviewed — not folded into a validator commit.

## Notes

Fault tolerance is unaffected: `failuresToKill` counts members, not sectors.

## Related Documentation

- **Spec**: `.development/specs/implemented/raid-sandbox-domain-model.md` §5c (capacity),
  §6 (constraint vocabulary — the `mixed-disk-sizes` soft rule)
- **Code Locations**: `src/engine/model.js` (`capacityGB`),
  `src/engine/validator.js` (`checkMixedDiskSizes`)
- **Ground truth**: `drivers/md/raid0.c` (`create_strip_zones`)

---

📍 **Investigation Note**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) to locate relevant files and understand the architectural context before starting your analysis.
