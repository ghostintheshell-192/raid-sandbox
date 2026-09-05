---
type: bug
priority: low
status: open
discovered: 2026-07-31
related: []
related_decision: ../reference/decisions/003-desktop-only.md
---

# The Physical Layer canvas has no click-to-build picker — drag is its only path

> **Re-scoped 2026-09-05** (ADR-003): the touch half of this issue is gone with the mobile flow; what is left is the asymmetry with the data layer, which keeps its click-to-build picker. Priority down to low. See "Re-scoped" at the end.

## Problem

Reported by Valentina from a real touch device: on the "Physical Layer" canvas
(axis A — components and wiring), touch interaction falls back to raw
drag-and-drop, which does not work reliably on a touchscreen.

## Analysis

`overview.md` documents the mobile flow as inverted: "tap a slot → it offers the
pieces that fit" instead of drag-first. That inversion exists, but only on one of
the two canvases.

- `src/sandbox/canvas-controller.js` (the RAID array canvas, axis B) implements
  it: every disk, array body, and the empty-canvas add-zone has a `click`
  listener that opens `_openPicker` with compatible options
  (`_makeAddZone`, `_makeDiskEl`, `_makeArrayEl`).
- `src/sandbox/physical-controller.js` (the Physical Layer canvas, axis A) has
  no equivalent. Its only `click` listeners are the delete buttons for a
  component and for a wire (verified by grep — no `_openPicker` call, no
  tap-to-build zone). Every component placement and every wire is created
  through `draggable="true"` elements, so on touch it depends entirely on the
  generic shim in `touch-dnd.js` (touch-and-hold 180ms → synthetic
  dragstart/dragover/drop). That shim is deliberately conservative
  (press-and-hold, then a ghost the finger must steer onto the exact drop
  target) and was never meant to be the *only* touch path — on axis B it is a
  fallback underneath the picker, not the primary mechanism.

Not yet confirmed in-browser device-by-device which physical-layer interactions
are affected (placing a component vs. drawing a wire may differ — a wire drag
is fundamentally a two-point gesture and may not map onto the picker pattern as
directly as "tap a disk, pick a size").

## Possible Solutions

- **Option A**: extend the `_openPicker` pattern from `canvas-controller.js` to
  component placement on `physical-controller.js` (tap an empty area / a
  compatible port → offers the components that fit there). Wiring (dragging a
  connection between two ports) would still need its own touch-friendly answer,
  since there is no obvious "picker" for a two-endpoint gesture.
- **Option B**: keep drag-and-drop but make the `touch-dnd.js` shim itself more
  forgiving on axis A specifically (larger hit-targets, snapping to the nearest
  valid port instead of requiring the ghost to land exactly on it).
- **Option C**: some hybrid — tap-to-place for components (Option A), improved
  drop-target snapping for wires (Option B).

## Recommended Approach

To be determined — needs in-browser triage first to separate "placing a
component" from "drawing a wire," since they may need different fixes.

## Notes

Surfaced 2026-07-31 while ADR-001 (`feature/derived-controller`) was in
progress; unrelated to that work, parked here rather than pulled into the
current branch.

## Related Documentation

- **Spec**: `overview.md` (Tech Stack — "Mobile flow inverted") states the
  intended pattern that axis A is missing.
- **Code Locations**: `src/sandbox/physical-controller.js` (no picker),
  `src/sandbox/canvas-controller.js` (`_openPicker`, `_makeAddZone`,
  `_diskPickerOptions` — the pattern to extend), `src/sandbox/touch-dnd.js`
  (the current, sole touch path on axis A).

## Re-scoped (2026-09-05)

[ADR-003](../reference/decisions/003-desktop-only.md) makes RAID Sandbox a desktop
game: the touch paths are gone — `touch-dnd.js`, the shim this issue called "the
current, sole touch path on axis A", was deleted with them — so the half of this issue
that was about a phone no longer exists.

The other half does. The data layer keeps its inline picker as **click-to-build** next
to drag-and-drop; the physical layer has drag-and-drop and nothing else. On a desktop
pointer that is a complete answer, which is why the priority drops to low. It is not a
closed question, for two reasons:

- **consistency** — a player who has learned "click an empty spot and it offers what
  fits" on the data layer meets a canvas where that does nothing;
- **accessibility** (roadmap item 9) — a click-driven picker is the base a keyboard path
  can be built on; a drag-only canvas is not.

Option A (the picker, `_openPicker` + `_diskPickerOptions` as the pattern to extend) is
still the one to take when item 9 is picked up. Options B and C were about touch and
are gone with it.

---

📍 **Investigation Note**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) to locate relevant files and understand the architectural context before starting your analysis.
