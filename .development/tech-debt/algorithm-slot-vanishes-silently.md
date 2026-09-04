---
type: feature
priority: medium
status: resolved
discovered: 2026-09-04
related: [algorithm-drop-ignores-class.md]
related_decision: null
---

# The algorithm slot disappears without saying why

> **Resolved 2026-09-05** on `feat/algorithm-slot-explains-absence` (Option A) — see
> the resolution section at the end.

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

---

📍 **Investigation Note**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) to locate relevant files and understand the architectural context before starting your analysis.

## Resolution (2026-09-05)

Option A, as recommended: the algorithm slot is now always rendered. `_makeSlots` in
`src/sandbox/canvas-controller.js` still appends a live slot for parity and flat-mirror
classes; every other class now gets a disabled slot instead of no slot at all.

- **The wording lives in data, not code** (ADR-002), and is written for the CLASS, not
  the level. The three classes that reach the disabled branch — linear+none,
  linear+mirror, striped+none — are exactly the three leaf-shaped level defs
  `jbod.yaml`, `raid1.yaml` and `raid0.yaml` already declare (`shape.members: disks`),
  which is a fine home for the sentence, but the lookup ignores member kind (see
  below): a RAID 51's outer node is linear+mirror too, and a RAID 50's outer node is
  striped+none too, so the sentence had to stop naming a level and start naming the
  class — "member", not "disk"; "stripe", not "RAID 0" — so it stays true whether the
  node's members are disks or spans. Each level now carries a new one-line field,
  `noAlgorithmReason`:
  - `raid1.yaml` (linear+mirror): "a plain mirror has no layout to choose — every member holds a full copy"
  - `raid0.yaml` (striped+none): "a plain stripe has no parity and no copies to place"
  - `jbod.yaml` (linear+none): "a concatenation places nothing — members are joined end to end"
- **Why the level catalogue, not a new file or the algorithm files**: `state.levels`
  (built from `data/raid-levels/*.yaml`) is already loaded into the sandbox's canvas
  state — `_noAlgorithmReason` in `canvas-controller.js` just looks up the leaf-shaped
  def whose `shape.segmentation`/`shape.redundancy` match the array's own two
  attributes, the same two attributes `_axisOptions` already keys off. It deliberately
  does not use `levels.match()` (which recognizes the whole tree and requires uniform
  member kind): a RAID 51's outer mirror-of-spans would not match RAID 1's shape at
  all (its members are arrays, not disks), so a level-recognizing lookup would leave
  it with no sentence, or borrow RAID 1's — which would have been wrong, since RAID 1's
  original wording ("every disk holds a full copy") is false on a node whose members
  are spans. The lookup is on the two class attributes alone, and the sentence was
  reworded to match: true for a node regardless of what it directly contains.
- **The disabled slot accepts no drop and opens no picker**: `_makeSlot` returns early
  for the disabled case with its own `click`/`dragover`/`drop` handlers that only
  `stopPropagation`/`preventDefault` — the same guard style
  `fix/algorithm-drop-ignores-class` used for the live slot's class check, just applied
  before there is a picker or a setter to guard at all.
- **Visually quiet**: a new `.sbc-slot--disabled` class in `styles/sandbox.css` reuses
  the empty slot's dashed shape at lower opacity, drops the algorithm tint, and sets
  `cursor: default`. The reason text is the slot's `title` (a native tooltip); the
  visible placeholder just says "no layout to choose" — no new panel, no warning
  colour.
- **Test**: `tests/raid-levels-data.test.js` gained
  `leaf levels with no placement algorithm (not parity, not flat mirror) have
  noAlgorithmReason set`, mirroring the existing `defaultAlgorithm` invariant tests.
  The fixture (`tests/fixtures/raid-levels.js`) was not touched — like
  `defaultAlgorithm`, prose fields are not mirrored there.

**Not headlessly testable beyond the data.** `canvas-controller.js` is DOM-only (see
`algorithm-drop-ignores-class.md`'s resolution for why); the slot's disabled behaviour
was verified in-browser, not added as a headless test.

**Browser check**: build a RAID 1 (linear+mirror) — the algorithm slot is present,
disabled, hovering shows the RAID 1 sentence. Switch the same array to parity — the
slot comes alive with the four rotations. Build a RAID 0 (striped+none) — disabled with
its own sentence. On touch, tapping the disabled slot opens nothing, and dragging an
algorithm chip onto it does nothing.
