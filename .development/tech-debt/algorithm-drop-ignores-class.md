---
type: bug
priority: low
status: open
discovered: 2026-09-02
related: []
related_decision: null
---

# Dragging an algorithm chip onto an array ignores the array's class

## Problem

The tap picker on an array's algorithm slot offers only the algorithms of that
array's class (`_axisOptions('algorithm', …)` in `src/sandbox/canvas-controller.js`:
left/right × symmetric/asymmetric for parity, near/far/offset for a flat mirror).
The drag path does not: dropping a `near` or `far` chip onto a RAID 6 (or a `Left
Sym` chip onto a flat RAID 10) is accepted by `_resolveDropAction` and by the slot's
drop handler, and `CS.setAlgorithm` stores it.

Found in-browser by Valentina, 2026-09-02, right after the stale-algorithm fix
(`fix/stale-algorithm-on-class-change`): a RAID 6 with Left Sym took `far`.

## Analysis

The engine is not fooled: `layout.js` resolves an algorithm unknown to the array's
class to the class default and reports it in `placement.fallback`, so the grid stays
true. But the fallback was designed as a safety net for incomplete resource files
(spec §5b), "NOT a user-facing choice" — the UI is supposed to make an impossible
choice unreachable, and the drag path does not.

## Possible Solutions

- **Option A**: in both drop handlers, accept an algorithm payload only if
  `_axisOptions('algorithm', arrayId).includes(payload.value)`; otherwise ignore the
  drop (same as an incompatible port wire: the canvas simply declines).
- **Option B**: also grey out, in the sidebar, the algorithm chips that do not apply
  to the array under the cursor during a drag (a hint, on top of A).

## Recommended Approach

Option A — one predicate reused from the picker, two call sites. B is a nicety.

## Related Documentation

- **Spec**: `.development/specs/implemented/raid-sandbox-domain-model.md` §5b
  (algorithm fallback is an internal safety net, not a user-facing choice)
- **Code Locations**: `src/sandbox/canvas-controller.js` (`_resolveDropAction`, the
  slot `drop` handler, `_axisOptions`), `src/engine/layout.js`
  (`resolveParityAlgo`, `resolveRaid10Layout`)

---

📍 **Investigation Note**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) to locate relevant files and understand the architectural context before starting your analysis.

## Seen in the browser (2026-09-04)

Confirmed while testing the animation gate: an array of `striped + parity1` carrying the
`near` layout, dropped straight onto it from the sidebar's "LAYOUT (RAID 10 / 1E)" group.

It has a consequence not recorded when this was first written. The impossible state does
not merely exist — it **produces a misleading violation**. `cross-axis-near-far-offset`
fires and advises *"On hardware RAID, build a nested RAID 1+0 instead"*, which is not
advice about a parity array at all. The game explains carefully a situation that should
never have been reachable, and the explanation sends the player the wrong way.

That raises the cost of leaving this open: it is not only a state that should not exist,
it is a state that makes the game say something untrue.
