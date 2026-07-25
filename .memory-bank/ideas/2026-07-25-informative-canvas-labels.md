---
captured: 2026-07-25
status: promoted-to-spec
promoted_to: ../../.development/specs/planned/informative-ui.md
promoted_at: 2026-07-25
context: "emerged from the validator phase-2 work (refactor/validator-registry, PR #6): violations can now name spans, but the canvas cannot"
tags: [ux, terminology, teaching, canvas]
---

# The canvas should teach its own vocabulary

## The idea

Right now a player builds correct things without ever learning what they are called. They
drag disks into a box, drop a segmentation chip on it, and get a RAID 5 — but nothing on
the canvas says *span*, *drive group*, *virtual drive*, or what any of them means. The
terminology exists (§8 of the domain model locks it) and the Knowledge Base explains the
concepts, but between the two there is a gap: **while playing**, the vocabulary is absent.

The target: **every piece the player creates carries its correct label, with a short
explanation on hover** — a sentence, not a lesson. The Knowledge Base keeps its job
(explaining the concepts properly, at length); the canvas gets the *naming* layer, so the
words the KB uses are the words the player has already been seeing.

## Why it deserves attention

- It is the missing half of a loop that is now half-built. The validator identifies spans
  correctly and its messages name them; the canvas does not, so the player reads about
  "Span 2" and cannot point at it. (That specific gap is filed as tech debt —
  `.development/tech-debt/canvas-nodes-are-unnamed.md`.)
- It fits the founding principle rather than decorating it: *the level is derived, not
  selected*. Naming the parts as they are composed is the same idea applied one level
  down — the vocabulary is derived from what you built, not memorized beforehand.
- Hover explanations are the natural bridge to the KB: the short text answers "what is
  this", the KB answers "why does it work this way". Two registers, one vocabulary.

## Minimal next step, if picked up

Not a rendering task first — a **naming** one. List what the player can actually create
today (loose disk, leaf array, span inside a nested array, the nested parent, the physical
path nodes) and decide, against §8, what each is properly called and what its one-sentence
gloss is. That list is the artifact; the rendering is mechanical once it exists.

Open question worth settling early: does a label change with the build? A leaf array is a
"drive group" until it becomes a span of something larger. If the label is derived, it
follows the build; if it is stored, it goes stale. (The validator's positional labels are
derived — same reasoning.)

## Related

- `.development/tech-debt/canvas-nodes-are-unnamed.md` — the concrete first slice
- `.development/specs/implemented/raid-sandbox-domain-model.md` §8 — the locked terminology
- Knowledge Base rework (still-undefined scope, in `CURRENT-STATUS.md`) — related but
  distinct: that is about the KB's own content, this is about the canvas
