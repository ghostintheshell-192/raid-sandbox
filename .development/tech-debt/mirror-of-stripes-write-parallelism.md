---
type: bug
priority: low
status: resolved
discovered: 2026-09-05
related: [raid0plus1-difference-not-surfaced.md]
related_decision: null
---

# A mirror of striped legs writes as one disk — RAID 0+1 gets `writeMult 0.5`

> **Resolved 2026-09-06** on `feature/knowledge-base`, by Option A, one step further than
> written: `writeParallelism` of a mirror is one copy's width, `writeClass` short-circuits
> only a mirror of *disks*, **and** `writePenalty` of a mirror is the copy count times
> one copy's own penalty (a pair 2, a three-way mirror 3, a mirror of RAID 5 spans 2 × 4)
> instead of the constant 2. The last step was forced by the knowledge base, whose
> write-penalty entry states the rule as *n* copies → *n* writes and could not disagree
> with the engine. Hand-derived values in `tests/model-perf.test.js` [8]; the `database`
> decision is recorded in `tests/challenge.test.js`.

## Problem

`model.js` counts the disks a write is spread over (`writeParallelism`) only when the
top node is striped. A linear mirror returns `1` — "the single active member" — whatever
that member is. For a mirror of two disks that is right. For a mirror of two striped
legs it is not: every write goes to both legs, and inside each leg it is striped over the
leg's whole width.

Checked 2026-09-05 with the engine, four disks each:

| build | `parallelism` | `writePenalty` | `writeMult` | `writeClass` |
|---|---|---|---|---|
| RAID 1+0 (stripe of two mirrors) | 2 | 2 | 1 | high |
| RAID 0+1 (mirror of two stripes) | 1 | 2 | **0.5** | **medium** |

The two arrays write the same four disks in the same pattern — two copies, each striped
over two disks. Their write numbers should match, as their read numbers do since
`fix/raid0plus1-read-class` (PR #27). The `0.5` says a four-disk 0+1 writes slower than
a single disk, which is false.

## Analysis

Two places, same shape as the read-class fix:

- `writeParallelism` — the linear branch returns `1`. A mirror should return the width
  of one copy: every copy is written, so the parallelism is what one leg spreads a write
  over (a mirror of disks: 1; a mirror of 2-disk stripes: 2). Not the sum across legs —
  the copies are the same data, and the penalty already charges for writing them twice.
- `writeClass` — the linear-top short-circuit returns `medium` for any mirror before
  looking at the penalty. A mirror of striped legs has penalty 2, which the striped
  branch already classes as `high` (that is how RAID 10 reads high). The short-circuit
  should apply to a mirror of *disks*, not to a mirror in general.

`readParallelism` and `readClass` already do this correctly for the mirror branch; the
write side was never given the same treatment.

## Possible Solutions

- **Option A**: fix both functions as described — a mirror's write parallelism is one
  copy's width, and `writeClass` only short-circuits when the mirror's members are
  disks. RAID 0+1 then lands on the same write numbers as RAID 1+0.
- **Option B**: leave the numbers and special-case the display. Rejected on sight: the
  engine would keep a false number (ADR-002 wants the engine right, not patched over).

## Recommended Approach

Option A, **but it is a domain decision first, not a code fix**: with the write class at
`high`, RAID 0+1 satisfies the `database` challenge (`writeClass in [high]`,
`faultTolerance >= 1`, four disks), which today only RAID 1+0 passes. That is correct —
the challenge asks for read, write and one failure survived, and 0+1 delivers all
three; what makes 0+1 worse (the second failure) is not in the requirement vocabulary.
Since PR #31 the sandbox says so through the `level-advisory` soft warning, so the
player who solves `database` with 0+1 wins the challenge and reads why 1+0 would have
been the better answer. Valentina agreed to file this (2026-09-05); whether the
challenge should also ask for something 0+1 cannot give is her call when this is
picked up.

## Notes

- Fix and test together: `tests/model-perf.test.js` already carries the 0+1 / 1+0
  read-side pairs; add the write-side pairs next to them, hand-derived first.
- `challenge.test.js` may need a case stating that 0+1 now satisfies `database`, so the
  decision is recorded as a test and not as a surprise.

## Related Documentation

- **Related Issues**: `raid0plus1-difference-not-surfaced.md` (resolved — the advisory)
- **Spec**: `.development/specs/implemented/raid-sandbox-domain-model.md` §5 (performance classes)
- **Code Locations**: `src/engine/model.js` — `writeParallelism`, `writeClass`;
  `data/challenges/database.yaml`

---

📍 **Investigation Note**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) to locate relevant files and understand the architectural context before starting your analysis.
