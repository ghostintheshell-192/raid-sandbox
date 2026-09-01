---
type: testing
priority: medium
status: resolved
discovered: 2026-07-31
related: [ports-double-source-of-truth.md]
related_decision: null
---

> **Resolved 2026-09-02** on `refactor/physical-model-in-engine` (Option C: A for
> the future, the audit once) — see the resolution sections at the end.

# `cpConnect` never checks port compatibility — headless tests wire canvases no player could draw

## Problem

`CS.cpConnect(state, fromId, fromPort, toId, toPort)` (`src/sandbox/canvas-state.js`)
connects any two nodes by id, unconditionally. It never calls `portsCompatible`
(`src/sandbox/physical-controller.js`), the check the real drag-and-drop UI runs on
every drop to decide whether a wire is even allowed to form.

The gap is not theoretical. Two concrete cases, one confirmed in-browser today
(2026-07-31), one found by reading the port-type table:

1. **`tests/canvas-state.test.js:392` — "hardware: the reason names the RAID-on-Chip,
   and points at it"**, the suite's own positive/happy-path test for the Hardware RAID
   verdict, wires `engine-roc.out` (`virtual-drive`) straight to `os-linux.in` (`cpu`)
   — types that `COMPATIBLE` never pairs (`virtual-drive` only matches `pcie`). The real
   path needs a CPU node in between (`engine-roc → cpu → os`, as built and verified
   in-browser today — see the hardware-branch test session). The same shortcut recurs
   at lines 470, 506, 566, and on the fake side at 482-483 (`engine-metadata.out` →
   `os.in` direct).
2. **`tests/canvas-state.test.js:540` — "an HBA wired after the engine is told it is on
   the wrong side"** wires `backplane.out` (`routing`) directly to `engine-metadata.in`
   (`pcie`), then `engine-metadata.out` (`pcie`) to `hba.in` (`routing`) — both pairs
   type-incompatible. Valentina tried to draw exactly this in the browser today (HBA
   after the metadata chip, and backplane straight into the chip) and neither wire would
   form; the UI's port check refuses both. The `hbaIsDownstream` message this test
   asserts on (`hbaGateFor` in `_recognizePhysicalLayer`) is very possibly unreachable
   through actual play — a dead branch a passing test is hiding.

Because `loadComponentDefs` never runs in Node (by design — the zero-dependency test
discipline), and `cpConnect` itself is DOM-free, nothing in the headless suite currently
CAN reject an impossible wire even if it wanted to check.

## Analysis

This is the general form of the specific gap the last handoff already flagged for the
hardware/fake test session ("il test 'hardware' cabla engine-roc.out → os.in
direttamente"): not one stray test, but the absence of any enforcement at the layer
`cpConnect` operates at. Every hardware/fake-branch test that predates today inherited
whatever wiring was convenient to write, not necessarily what the port-type table
allows — because nothing would have failed either way.

Two different things are entangled and worth separating before fixing:
- Tests asserting **positive verdicts** (line 392 and its siblings) should describe a
  buildable canvas — if they don't, the test is not proof the feature works for a real
  player.
- Tests asserting **error messages for specific broken states** (line 540) may
  deliberately want an unreachable-in-UI state, if the message exists as defense in
  depth (the same reasoning `control-path-tolerates-cycles.md`'s Resolution gives for
  why the graph walk still tolerates a cycle even though the UI can no longer draw one).
  Whether `hbaIsDownstream` is worth keeping as dead-code defense, or whether it should
  be deleted along with its test, is a design call, not a mechanical fix.

## Possible Solutions

- **Option A**: add `portsCompatible` validation to `cpConnect` itself (or a checked
  wrapper the tests call), so an incompatible wire fails loudly in Node exactly as it
  fails silently (no wire drawn) in the browser. Closes the gap at the root — every
  future test is honest by construction.
- **Option B**: leave `cpConnect` permissive (it is a low-level state mutator, arguably
  correct for it to trust its caller) and instead audit the existing hardware/fake tests
  by hand, rewiring each to a real drawable path; add one narrow consistency test that
  walks every `cpConnect` call site in the suite and flags type mismatches, similar in
  spirit to `ports-double-source-of-truth.md`'s Option A.
- **Option C**: do both — Option A for the future, Option B once, to fix what already
  exists.

## Recommended Approach

To be determined. Option A is the more durable fix but changes what `cpConnect` is
allowed to do (currently a trusted low-level primitive, used freely by `cpAutoRoute` and
other internal callers that should never need the check); Option B is safer but leaves
the door open for the same drift to recur. Needs a decision before either lands, not a
mechanical pass.

## Notes

Confirmed in the same session that completed the ADR-001 in-browser hardware/fake
testing pass (handoff `2026-07-30-2249`, Next item 3). The `hbaIsDownstream` branch
question is new information from today's browser session, not carried over from that
handoff.

## Related Documentation

- **Related tech-debt**: `ports-double-source-of-truth.md` (a different port-table gap
  — duplication, not missing validation — but the same general area of the codebase and
  a plausible shared fix session)
- **Code Locations**: `src/sandbox/canvas-state.js` (`cpConnect`, `cpAutoRoute`),
  `src/sandbox/physical-controller.js` (`portsCompatible`, `COMPATIBLE`),
  `tests/canvas-state.test.js` (lines 392, 470, 482-483, 506, 540, 566)

## Solution Implemented

**Option C.** For the future (Option A): `CanvasState.cpConnect` now asks
`cpCanConnect`, which answers from the component catalogue (`engine/catalog.js`,
built from `data/components/*.yaml`: port direction and the directional port-type
relation) plus the state's own two rules (no self-loop; disks are never wired by
hand), and **throws** when the answer is no. The browser asks `cpCanConnect` before
drawing, so it never hits the throw; a test that wires an impossible canvas now
fails loudly at the wire, not silently at the assertion. Disk → acceptor edges are
created by `cpAutoRoute` alone, marked `derived: true`, and `cpDisconnect` refuses
them — so `cpAutoRoute` no longer needs the permissive primitive the Analysis
worried about.

Once (Option B): every physical-layer test in `canvas-state.test.js` was rewired
onto a path a player can draw — RoC → PCIe bus → CPU → OS for the hardware happy
path (was RoC → OS direct), CPU inserted wherever an engine fed the OS directly,
the cycle test now loops through a PCIe bus (`pcie → pcie` is a legal pair, so
that cycle remains drawable and the walk must still tolerate it).

The design call the Analysis deferred is taken: **`hbaIsDownstream` is gone, with
its test.** With typed ports nothing but a backplane outputs `routing` and no
engine feeds a backplane, so "the HBA sits after the engine" described a canvas no
player will ever see. (Flagged for Valentina at the step-1 checkpoint; reversible.)

## Testing

`tests/canvas-state.test.js` (55, including a new section: incompatible wire
refused with a reason naming the types; self-loop and hand-wired disk refused;
no catalogue → nothing wires; disks route when the acceptor appears, before any
`evaluate()`; derived edge cannot be disconnected; removing the acceptor drops the
edges and a new one re-routes them; `evaluate()` leaves the edge set unchanged).

## Impact

The headless suite can no longer assert on a canvas the UI would refuse, and
`evaluate()` is pure — routing became a mutation (add/remove disk or component),
which is what makes the verdict reproducible from the state alone.

---

📍 **Investigation Note**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) to locate relevant files and understand the architectural context before starting your analysis.
