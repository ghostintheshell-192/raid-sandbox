---
type: bug
priority: medium
status: resolved
discovered: 2026-07-25
resolved: 2026-07-25
related: []
related_decision: null
---

# The physical recognizer checks presence and one edge, not the path

## Problem

`_recognizePhysicalLayer` (`src/sandbox/canvas-state.js`) decides hardware / software /
fake from **which component types exist** plus **one outgoing edge** from the
engine-bearing node. It never verifies that a path actually runs from the disks to the OS.

Builds that are still wrong, and still get a verdict:

- an **HBA not connected to anything** — the software/fake branch only inspects the
  engine's outgoing edge, so the HBA can float;
- **disks not reaching** the backplane/controller (auto-routing normally prevents this,
  but nothing in the recognizer depends on it);
- a **PCIe bus or CPU sitting unconnected** between engine and OS;
- any extra, disconnected component the player left on the canvas.

The player is told "Software RAID" — and now told *why* — about a path that does not exist
end to end.

## Analysis

The file documents the shortcut: *"For MVP: inspect the set of component types present in
the graph. Full graph-traversal recognizer deferred to when constraint engine lands."*
The constraint engine has since landed (`validator.js`, now a rule registry), so the
condition attached to that deferral is met.

What changed today is the cost of the shortcut. As long as the panel printed a bare
verdict, an unfounded conclusion was invisible. Now that the verdict explains itself
(2026-07-25), every unfounded conclusion also prints a confident sentence about how the
build works — which is how this was caught: a controller dropped on an empty canvas
announced "Hardware RAID" with a full explanation, no cables anywhere. That specific hole
is fixed (the engine-bearing node must be wired onward and the path must reach an OS), but
it was one instance of the general problem.

## Possible Solutions

- **Option A**: reachability check — walk `cpEdges` from each disk and require the OS node
  to be reachable through the engine-bearing node. Cheap (a BFS over a tiny graph),
  catches every case above, and stays close to the current structure.
- **Option B**: a full path recognizer that also validates ORDER (disks → backplane → HBA
  → engine → PCIe → CPU → OS, per §2), reporting the first wrong link. More teaching value
  — it can say *what* is out of place — and considerably more work.
- **Option C**: leave it, and keep tightening branch by branch as holes are found.

## Recommended Approach

**Option A first.** It converts "these components exist" into "this path exists", which is
the actual claim the badge makes, and its failure mode is a clear message instead of a
confident wrong one. Option B is worth it only if the physical layer becomes a teaching
surface in its own right — a decision that belongs with the informative-UI work.

Do it on its own branch: it changes when the game is willing to say "this is a hardware
RAID", so it needs its own in-browser pass across all three types.

## Resolution (2026-07-25) — Option A

`src/engine/graph.js` (new, headless) indexes the control path as a directed graph and
answers reachability; `_recognizePhysicalLayer` now walks it. A component counts as being
on the path only when **a disk reaches it and it reaches an OS** — presence is no longer
read as participation, which is what let a floating HBA satisfy the software branch.

Three things surfaced while doing it, each now covered by a test:

- **Cycles are constructible, not hypothetical.** The RAID Engine's ports are typed `any`
  and `portsCompatible` short-circuits on `any`, so `engine → backplane` is a legal draw.
  Every walk carries its visited set from the first step.
- **The graph spans two node maps.** Disks live in `state.nodes` and appear in `cpEdges`
  by disk id only. A traversal built from `cpNodes` alone has no sources at all.
- **`cpAutoRoute` was only ever called by the physical view's `render()`** — domain truth
  (protocol → entry point) reached from the DOM layer. `evaluate()` now calls it before
  recognising, otherwise the verdict would depend on whether a render had happened.

Over-strictness was watched for: junk the verdict does not depend on (a stray PCIe bus)
still passes, and each refusal names what is missing rather than falling silent.

**Deliberately not done — Option B.** Order is still unverified: a path can be reachable
and physically absurd (engine between CPU and OS, two engines in series). The
fake-vs-software discriminant is likewise unchanged, still the direct `engine → OS` edge.
Both belong to the derived-controller work (`specs/planned/derived-controller.md`), whose
two-threshold rule is the thing that will actually need order — and which can now ask for
it as two reachability queries in opposite directions rather than as a path.

## Notes

Watch for over-strictness. Tightening this makes the game refuse to name a type in
situations where it used to name one, and the player has to understand *why* — so the
accompanying message matters as much as the check. `controlPathIssue` is where that
message goes.

## Related Documentation

- **Spec**: `.development/specs/implemented/raid-sandbox-domain-model.md` §2 (axis A, the
  engine-position insight)
- **Planned**: `.development/specs/planned/informative-ui.md`
- **Code Locations**: `src/sandbox/canvas-state.js` (`_recognizePhysicalLayer`,
  `_buildPhysicalAdapter`), `tests/canvas-state.test.js` §13b

---

📍 **Investigation Note**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) to locate relevant files and understand the architectural context before starting your analysis.
