---
type: testing
priority: low
status: resolved
discovered: 2026-09-04
related: []
related_decision: reference/decisions/002-the-engine-holds-no-domain-facts.md
---

> **Resolved 2026-09-05** on `test/level-numbers-honest-group` (Option B) — see the
> resolution section at the end.

# Level files declare numbers the engine also computes, and nothing compares them

## Problem

`faultTolerance`, `writePenalty` and `capacityFormula` exist twice: as fields in
`data/raid-levels/*.yaml`, and as derivations in `model.js`. Nothing checks that the two
agree.

## Analysis

Checked on 2026-09-04: at each level's minimum disk count, declared and computed fault
tolerance agree in all 14 levels. So nothing is wrong today.

What is missing is anything keeping it that way. `raid-levels-data.test.js` asserts that
the fields exist and are internally plausible (`faultTolerance == 0` only for
`redundancy: none`); it never compares them against the engine. The headless fixture
mirrors only the six keys the recognizer consumes.

There is also a subtler mismatch already present. The declared value is **fixed**; the
real one depends on the build:

| build | file says | engine computes |
|---|---|---|
| RAID 1, 2 disks | 1 | 1 |
| RAID 1, 3 disks | 1 | **2** |
| RAID 1, 4 disks | 1 | **3** |

The engine is right and the panel shows the engine's number, so the player is not misled
today. But the file's value is the *level's minimum*, not the array's tolerance — the
moment that field is displayed as-is, it starts lying. That matters because the level
prose is exactly what the info channel (roadmap item 2) will start displaying.

## Possible Solutions

- **Option A**: add a test comparing declared against computed at each level's minimum
  disk count. Catches drift, does nothing about the semantics.
- **Option B**: A, plus rename the fields to what they are — `faultToleranceAtMinimum`, or
  a `reference:` block marking the whole group as documentation rather than data.
- **Option C**: delete the three fields. The engine is the authority (ADR-002: one source
  per fact) and the numbers are derivable.

## Recommended Approach

**Option B.** C is the purest reading of ADR-002 but throws away text a human wrote for a
human — `capacityFormula` ("(N − 1) × disk size") is a *teaching* string, not a value the
engine could produce. Naming the group honestly keeps it and removes the trap.

Whoever wires up the level prose (roadmap item 2) should take the prose and leave these
three numbers to the engine.

## Notes

`capacityFormula` is read by nobody at all; `writePenalty` and `faultTolerance` are read
from the engine's own derivation, never from the file.

## Related Documentation

- **Census**: `reference/unspoken-content.md` — "The duplicated numbers"
- **Decision**: `reference/decisions/002-the-engine-holds-no-domain-facts.md`
- **Code Locations**: `data/raid-levels/*.yaml`, `src/engine/model.js` (`faultTolerance`, performance), `tests/raid-levels-data.test.js`

## Resolution (2026-09-05)

Option B, in all 14 `data/raid-levels/*.yaml` files and `tests/raid-levels-data.test.js`:

- `faultTolerance`, `writePenalty` and `capacityFormula` now live under a `reference:`
  block, each preceded by a comment naming it documentation, not data the engine reads.
  `faultTolerance` is renamed `faultToleranceAtMinimum` inside that block — the field is,
  and was already, the level's tolerance *at its minimum disk count*, not the array's; the
  new name says so instead of implying a fixed property of the level.
- `defaultAlgorithm` and (RAID 6's) `parity` stay where they were — they are not part of
  this duplication, and `levels.js` still reads only `id`, `name`, `reason`, `shape`,
  `minDisks`, unchanged.
- A new guard `[4]` in `raid-levels-data.test.js` builds, for each level, the smallest tree
  its `shape` allows at `minDisks` (a leaf shape is `minDisks` disks; a nested shape is 2
  equal spans of `minDisks / 2` disks each — the split every nested level's YAML comment
  already assumed) and asserts `model.js`'s derived `faultTolerance` equals the declared
  `reference.faultToleranceAtMinimum`. All 14 passed on the first run, confirming the
  2026-09-04 hand check.
- `tests/fixtures/raid-levels.js` is unchanged: it mirrors only the six keys the engine
  reads, and `reference` was never one of them.

No engine or gameplay change: nothing in `src/` reads the YAML's `faultTolerance`,
`writePenalty` or `capacityFormula` — the panel already shows `model.js`'s own derivation
(`index.html`'s `a.faultTolerance`, from `analyze()`), confirmed unchanged by grep before
this change and untouched by it.
