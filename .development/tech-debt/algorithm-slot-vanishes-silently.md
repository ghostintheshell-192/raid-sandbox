---
type: feature
priority: medium
status: open
discovered: 2026-09-04
related: [algorithm-drop-ignores-class.md]
related_decision: null
---

# The algorithm slot disappears without saying why

## Problem

The algorithm slot on an array appears or vanishes depending on the array's class, with no
explanation. A player who sets up a parity array sees four rotation options; switching the
array to a linear mirror makes the slot itself disappear.

Nothing was refused, because nothing was offered. There is no message, and no moment at
which one could be shown.

## Analysis

`_axisOptions('algorithm', …)` in `canvas-controller.js` returns the four parity rotations
for a parity array, the three mdadm layouts for a flat mirror, and an **empty list**
otherwise — and an empty list means no slot.

The behaviour is correct: a linear mirror has no placement algorithm to choose. The
problem is that this is a *fact about RAID* the player could learn, delivered as an
absence.

It is worth setting beside a case the game handles well. "This algorithm does not belong
here" is stated out loud when the cause is the operating system
(`cross-axis-near-far-offset` explains that near/far/offset are mdadm-only) and swallowed
when the cause is the array's class. **Same lesson, told in one case and hidden in the
other.** Nobody decided that; it accumulated.

Of the three ways the game refuses (`reference/refusal-points.md`), this is the only
instance of "it does not offer" — the one mechanism with nowhere to attach an
explanation.

## Possible Solutions

- **Option A**: always render the slot, disabled, with a one-line reason ("a linear mirror
  places no algorithm"). The absence becomes a statement.
- **Option B**: keep the slot hidden and put the explanation in the info channel (roadmap
  item 2), attached to the array.
- **Option C**: render the slot only when there is something to say — i.e. when the array
  *had* an algorithm and lost it through a class change — so a build that never had one is
  not cluttered.

## Recommended Approach

**Option A**, provided the disabled slot is visually quiet. It is the only option that
reaches a player who does not know there was a question. C is clever but ties the
explanation to a transition, so the beginner who starts from a linear mirror never sees
it.

The wording should come from data, not code, in keeping with ADR-002 — most plausibly a
line on the level or on the algorithm family.

## Notes

Related but distinct from `algorithm-drop-ignores-class.md`: that one is the *drag* path
accepting an algorithm the picker would have filtered. Both live in the same predicate and
would sensibly be fixed together.

## Related Documentation

- **Census**: `reference/refusal-points.md` — "It does not offer — silent absences"
- **Roadmap**: item 2 (info icons)
- **Code Locations**: `src/sandbox/canvas-controller.js` (`_axisOptions`, `_makeSlot`)
