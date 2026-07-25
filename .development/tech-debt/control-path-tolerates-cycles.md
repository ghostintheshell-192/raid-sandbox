---
type: bug
priority: low
status: open
discovered: 2026-07-25
related: [physical-recognizer-does-not-walk-the-path.md]
related_decision: null
---

# A control path that loops back on itself is accepted in silence

## Problem

The RAID Engine's ports are typed `any`, and `portsCompatible` short-circuits on `any`, so
`engine → backplane` is a legal draw. Adding that edge to an otherwise correct software
build — keeping `engine → os` — produces a control path where the engine feeds back into
the component that feeds it.

Verified in-browser (2026-07-25): the verdict stays **Software RAID** and no violation is
raised. The build is physically meaningless and the game says nothing about it.

## Analysis

This is not a regression: it is the declared edge of what the traversal work covered.
`_recognizePhysicalLayer` now verifies that a path **exists** (a disk reaches the engine,
the engine reaches an OS) — reachability, Option A of
`physical-recognizer-does-not-walk-the-path.md`. Both facts remain true with the loop
present, so the verdict is correct on its own terms.

What is missing is any statement about the path being **well-formed**, which is the same
gap that lets an absurd component ORDER pass. A cycle is simply its most obvious species.

Reaching it takes deliberate effort: the player has to draw a second edge out of an
already-wired engine, backwards. Hence low priority — but it costs almost nothing to
detect, and the panel refusing to comment on an obviously broken drawing is exactly the
failure mode the informative-UI work is trying to remove.

## Possible Solutions

- **Option A**: a `physical` rule in the validator registry — walk forward from the disks
  and report a node reachable from itself. `engine/graph.js` already gives the traversal;
  the rule would state the fact and name the node, like every other §6 entry. Natural home
  is the physical half of validator phase 2 (handoff `2026-07-25-1502`, *Next* item 3).
- **Option B**: refuse the verdict outright, the way an incomplete path is refused. Too
  strong — the path genuinely exists, and silence teaches less than a warning does.
- **Option C**: forbid the draw in `physical-controller.js`. Rejected on principle: the
  sandbox **allows and explains** (§6), it does not block the build.

## Recommended Approach

**Option A, as a soft violation.** It fits the registry, reuses the graph, and keeps the
verdict — the player is told the drawing loops, not that they are forbidden from drawing
it.

## Notes

Whatever the rule says must survive the derived-controller rework, which may replace the
position-based reading of the path entirely. See
`.memory-bank/ideas/2026-07-25-fake-raid-has-no-chip-thresholds-may-not-be-positions.md`.

## Related Documentation

- **Tech debt**: `physical-recognizer-does-not-walk-the-path.md` (Resolution — order is
  deliberately still unverified)
- **Code Locations**: `src/engine/graph.js`, `src/engine/validator.js` (`RULES`),
  `src/sandbox/canvas-state.js` (`_recognizePhysicalLayer`),
  `tests/canvas-state.test.js` §13c
