---
type: bug
priority: medium
status: open
discovered: 2026-09-04
related: []
related_decision: null
---

# The knowledge base teaches a vocabulary the spec does not use

## Problem

`data/intro.yaml` — the only file the knowledge base reads — presents a **two-level**
storage model and names the first level with the second one's word:

> - **Drive spans (physical layer)** — Multiple physical disks joined into a single contiguous address space.
> - **Virtual disks (logical layer)** — The logical device the OS sees.

Spec §8 locks a **four-level** vocabulary:

```
Physical disks → Drive Group → Span(s) → Virtual Drive (VD)
```

What `intro.yaml` calls "drive spans" is the drive group. A span is a *subset* of a drive
group, which is the opposite relation.

## Analysis

Confusing span and drive group is a real, documented mistake: it happened to this
project's author while building, and it is exactly the error that produces RAID 0+1 in
place of RAID 1+0 (see `raid0plus1-difference-not-surfaced.md`). The introduction — the
first page a beginner reads — currently teaches the confusion.

A second, smaller divergence sits in the same file: of the four "key parameters" it
advertises, **rebuild time** is not computed or displayed anywhere in the game. It is also
the quantity behind `raid5.yaml`'s strongest warning ("rebuild time grows with disk
capacity, 12–24 h for large drives").

## Possible Solutions

- **Option A**: correct the two terms in `intro.yaml`, leave the two-level simplification.
  Minimal, and the simplification remains defensible for an intro.
- **Option B**: A, plus present all four levels of §8 — the beginner meets the vocabulary
  the rest of the game uses, once.
- **Option C**: B, and drop *rebuild time* from the key parameters until something computes
  it — or compute it (a rough model from capacity and level is derivable and citable).

## Recommended Approach

**Option B, and hold C for roadmap item 3.** Renaming without adding the levels leaves the
beginner with a two-level picture that the sandbox's own panels contradict. Rebuild time is
a real gap but it is a modelling decision, not a wording fix — it belongs to the knowledge
base rework, where the SEO decision also lands.

## Notes

Whatever is decided, spec §8 is the authority and this file must agree with it. If the
four-level chain is judged too much for an introduction, the fix is a note saying the
intro simplifies — not a different meaning for the same word.

## Related Documentation

- **Census**: `reference/unspoken-content.md` — "The knowledge base reads one file"
- **Spec**: domain-model §8 (terminology, locked)
- **Roadmap**: item 3 (knowledge base rework)
- **Code Locations**: `data/intro.yaml`, `kb.js`
