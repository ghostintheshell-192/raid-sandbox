---
captured: 2026-09-04
status: open
context: "session 2026-09-04, testing the animation gate — Valentina, on a RAID 5 built with two disks: 'ma quello che è stato creato è veramente errato? cosa succede alla parità quando ci sono solo due dischi?'"
tags: [engine, recognizer, teaching, model]
promote: "to a spec, next session — Valentina's call, taken the day it was captured"
---

# Levels that degenerate: recognize what runs, not only what was composed

**PROMOTE THIS FIRST.** Agreed 2026-09-04: this becomes a proper spec in the next
session, before any other roadmap item is picked up. Do not start work from this
note — write the spec, then work from that.

## What

Below its minimum width, every RAID level collapses into a simpler one. The game
names the level that was *composed* and says nothing about the one that actually
*runs*. Verified against the engine on 2026-09-04:

| composed | the game says | what actually runs |
|---|---|---|
| `striped + parity1`, 2 disks | RAID 5 | a mirror — the parity of a single data block is that block (P = D0), so the second disk holds an exact copy |
| `striped + parity2`, 3 disks | RAID 6 | a **three-way** mirror — with one data block, both P and Q are functions of it alone |
| `striped + mirror`, 2 disks | RAID 10 | a RAID 1 — two disks, two copies, nothing left to stripe across |

Today each of these produces a `min-disks` violation and an aspirational name. The
collapse itself — the interesting part — is never mentioned.

## Why it deserves attention

This is the game's whole purpose in one case. Valentina's framing: it is what a good
teacher stops the class for — *"we tried to build a RAID 5 and failed. But is what we
built actually wrong? What happens to parity when there are only two disks?"*

The answer connects dots that only connect for someone who already knows the material,
which is exactly the knowledge a sandbox can hand over and a quiz cannot.

**The truth is double, and the teaching lives in the gap.** Structurally it is a RAID 5
with two disks; behaviourally it is a mirror. Both are true, at different levels, and
neither should replace the other — a real system will treat it as RAID 5 (XOR computed
for nothing, and the array can be grown by adding disks, which a mirror cannot). Showing
only "degenerate RAID 1" would trade one imprecision for another.

## The shape of the answer (Valentina, 2026-09-04)

Leave the recognizer's box exactly as it is — **what the player is trying to build** —
and add a second box derived from what is actually on the data canvas — **what the player
actually has**. Errors then surface as the *diff* between the two boxes, rather than as
separately authored warnings.

Two properties worth keeping when this is specced:

- **It does not weaken the founding principle, it doubles it.** Spec §1 says the level is
  derived, never selected. Both boxes are derived; they simply read the same tree two
  ways — one for form, one for behaviour. Nothing is chosen.
- **It may absorb rules rather than add them.** If box 2 says "mirror" while box 1 says
  "RAID 5", the diff already carries the lesson; `min-disks` becomes the *explanation* of
  a visible difference instead of a standalone warning. Worth checking, when speccing,
  which §6 rules survive that and which become redundant.

## The open decision: declared or computed

**Declared** — each level file lists its own degeneracies:

```yaml
degeneratesTo:
  - when: { diskCount: 2 }
    becomes: raid1
    reason: "the parity of a single data block is the block itself"
```

Consistent with ADR-002, hand-verifiable (so it fits the ground-truth discipline), and
adding a case is adding lines. But it is a list of what someone already worked out: it
discovers nothing.

**Computed** — `layout.js` already produces the physical grid. If the grid for
`striped + parity1` over two disks is structurally identical to a mirror's, the engine
*finds that out by itself*, by comparing where the data actually lands. That is precisely
"expand the formulas and analyse the result". It also suggests a test in this project's
existing style: enumerate the small shapes and collect every equivalence, the way the
levels oracle enumerated 849 trees.

**Valentina prefers the computed reading (2026-09-04).** One limit to carry into the spec:
*equivalence of layout is not identity*. A two-disk RAID 5 and a RAID 1 put the data in
the same places but are not the same object — different write cost, different growth path.
The engine would discover "the data lands identically", which is part of the truth, not
all of it.

## Minimal next step

Write the spec. It needs to decide: declared vs computed (or computed with a declared
`reason` for the wording), what the second box shows when nothing degenerates, and which
§6 rules the diff makes redundant.

Related: [ADR-002](../../.development/reference/decisions/002-the-engine-holds-no-domain-facts.md)
(wherever the knowledge lives, it is data the engine reads),
`.development/reference/unspoken-content.md` (the level prose that would give the second
box its words), spec §1 (the founding principle), §4 (recognition ≠ validation — this
proposal reopens that boundary deliberately).
