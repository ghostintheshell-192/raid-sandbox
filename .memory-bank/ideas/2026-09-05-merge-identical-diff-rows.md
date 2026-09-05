---
captured: 2026-09-05
status: open
context: "degenerate levels §9 — the two boxes and the diff in the results panel, first browser check (branch feature/degenerate-levels)"
tags: [ui, degenerate-levels, results-panel]
---

# One diff row for identical rewrites, linked to every node it covers

A RAID 51 whose spans have two disks each produces two diff rows that read the
same — *RAID 5 · 2 disks → RAID 1*, same `because` — one per span, each linked
to its own node in the data layer. Correct, and Valentina accepted it as is, but
it says one thing twice.

Worth a look later: group rewrites with the same `level`, `from`, `to` and
`because` into one row, and highlight every node they came from. The plumbing
already allows it — `RaidHighlight.attach(row, [id1, id2, …])` takes a list of
node ids — so it is a grouping step in `renderRuns()` (index.html) plus a way to
say "Span 1, Span 2" in the row's head.

Minimal next step: group by `${level}|${from.segmentation}+${from.redundancy}/${from.members}|${to…}` in `renderRuns()`, pass the collected `nodeId`s to `attach`, prefix the head with the labels. Decide in the browser whether one row with two labels reads better than two rows.
