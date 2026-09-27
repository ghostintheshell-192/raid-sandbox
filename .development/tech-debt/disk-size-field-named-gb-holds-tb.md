---
type: code-quality
priority: low
status: open
discovered: 2026-09-27
related: []
related_decision: null
---

# The disk size field is named `sizeGB` but holds terabytes

## Problem

A disk's size is stored in a field called `sizeGB`, but every place that shows
it reads the number as terabytes: the data canvas label
(`` `${node.protocol} · ${node.sizeGB} TB` ``), the physical canvas label, and
the knowledge-base pages (the level examples, `sizeGB: 2`, are printed as
"2 TB"). What the player and the reader see is consistent. Only the name is
wrong, and it misleads whoever reads the code or the data files.

## Analysis

The name runs through every layer: the engine (`Model.disk`, the `Disk`
typedef, the validator's mixed-size check), the sandbox (canvas state and both
controllers), the build document, the `kb.example` block of the level files,
two specs and the tests. About 60 occurrences across 20 files.

The build document is the part that is not a plain rename. Its v1 readable form
names the key (`disks: [{ id, sizeGB, protocol, physPos? }]`), and a link in the
`j` wire form (plain JSON, used when ids are not of the `prefix-N` form) carries
that key inside the URL. The `c` compact form is positional and does not name
it. A rename that only changes the key would make those `j` links, and any
saved v1 document, fail to load.

## Possible Solutions

- **Option A**: rename to `sizeTB` everywhere; `validate()`/`loadDocument()`
  accept `sizeGB` as an alias on v1 documents. Keeps every existing link
  working; the alias is a declared fallback and has its own test.
- **Option B**: rename and bump the document to v2, with a v1 → v2 upgrade on
  load. Cleaner long term, more code for a one-field change.
- **Option C**: rename to a unit-free `size` and state the unit once, where it
  is displayed. Same compatibility question as A.

## Recommended Approach

To be determined. Option A is the smallest change that breaks no link. Do it
on its own `refactor/` branch, not together with other work.

## Notes

Found while reviewing the KB SEO pull request: its new "Try it" line on the
concept pages prints `${ex.sizeGB} TB`, like the level pages already did.

## Related Documentation

- **Spec**: `.development/specs/implemented/raid-sandbox-domain-model.md`
  (the `Disk` shape), `.development/specs/implemented/knowledge-base.md`
  (`kb.example`)
- **Code Locations**: `src/engine/model.js` (`disk()`), `src/engine/types.js`
  (`Disk`), `src/sandbox/build-document.js` (document v1, `validate`,
  `toCompact`/`fromCompact`), `src/sandbox/canvas-controller.js` and
  `src/sandbox/physical-controller.js` (the labels),
  `.development/scripts/generate-kb.js` (example text)

---

📍 **Investigation Note**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) to locate relevant files and understand the architectural context before starting your analysis.
