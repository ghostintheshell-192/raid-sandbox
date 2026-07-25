---
type: feature
priority: medium
status: open
discovered: 2026-07-25
related: []
related_decision: null
---

# The canvas does not name the things the player builds

## Problem

The validator now identifies spans correctly — a violation reads *"Span 2 is a RAID 5 —
it needs at least 3 disks and has 2"* — but **nothing on the canvas is called "Span 2"**.
The player reads a message about a node they cannot locate.

`_makeArrayEl` (`src/sandbox/canvas-controller.js:283`) builds an array as a bare
container: attribute slots, then its members. No title, no ordinal, no type name.

This is the reason the labels exist in the validator at all: a RAID 50 whose two spans
both mixed disk sizes printed the same sentence twice, and the panel had no way to say
they were about different arrays (fixed 2026-07-25 by naming the subject *inside* the
message). That fix works, but it is one-directional — the message names a node the canvas
does not.

## Analysis

The naming scheme already exists and is derived, not stored: `walkArrays` in
`src/engine/validator.js` labels the root `This array` and its array children
`Span 1`, `Span 2`, deeper ones `Span 1.2` — positional, matching the §8 vocabulary where
a *span* IS the child array of a nested level.

Two consequences worth separating:

1. **Locating** — the player must be able to find Span 2 on the canvas. Needs a visible
   ordinal on nested array nodes.
2. **Understanding** — the player does not necessarily know what a *span* IS, nor a drive
   group, nor a virtual drive. A visible label without an explanation trades one opacity
   for another. This half belongs to the wider plan, see the idea note linked below.

Where the label should be derived: the same positional walk, but the canvas works on
`state.nodes`, not on the compiled tree, and only the compiled tree is walked today. Either
the walk moves somewhere both can use (an engine helper taking a node + its parent chain),
or canvas-state derives labels during its own reconcile pass. **Not** stored on the node:
the ordinal changes when a span is added, removed or reordered, and a stored name would go
stale exactly like the ids did.

## Possible Solutions

- **Option A**: derive the label in a shared helper and render it as a small header on
  nested array nodes (`Span 1`, `Span 2`). Cheapest thing that closes the loop with the
  validator. Does not teach what a span is.
- **Option B**: A + highlight the referenced node when the player hovers a violation
  (`nodeId` is already on every violation and is now a real canvas id). Closes the loop
  both ways; the message becomes clickable rather than merely readable.
- **Option C**: the full labelling pass — every built piece named by what it is, with a
  short on-hover explanation. This is the wider plan, not this note.

## Recommended Approach

**Option A now, Option B next**, and treat C as its own workstream. A is a rendering
change with no engine risk; B needs a hover/anchor path from the violations panel to the
canvas node, which is real UI work but unlocks the `nodeId` that already exists and is
currently unused by anything.

## Notes

Do not let A ship a label the player cannot interpret without the KB. Even at A, `Span 2`
is better than nothing only because the violation message uses the same words — that
consistency is the whole value, so if the wording ever changes, it changes in both places.

## Related Documentation

- **Wider plan**: `.memory-bank/ideas/2026-07-25-informative-canvas-labels.md`
- **Spec**: `.development/specs/implemented/raid-sandbox-domain-model.md` §8 (locked
  terminology), §6 (constraint vocabulary)
- **Code Locations**: `src/sandbox/canvas-controller.js:283` (`_makeArrayEl`),
  `src/engine/validator.js` (`walkArrays`), `index.html` (`renderViolations`)

---

📍 **Investigation Note**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) to locate relevant files and understand the architectural context before starting your analysis.
