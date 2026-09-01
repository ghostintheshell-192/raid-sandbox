---
captured: 2026-09-01
status: open
context: "session 2026-09-01, branch docs/engine-extraction-analysis — Valentina's own framing: the engine, not the games, is the interesting part"
tags: [engine, extraction, framework, architecture]
---

# Extract the composition engine into its own project

**What.** The two-axis engine under the RAID game — a typed-port component graph
(axis A) and a recursive composition tree (axis B), with derivation, shape
recognition, a layered rule registry and requirement-based challenges on top — is
domain-agnostic in shape. Extract it into a separate project so other
"build-it-and-see-what-you-built" simulations can be written against it, and
decide whether it becomes a small framework.

**Why it deserves attention.** The founding principle ("the level is derived,
never selected") is not about RAID. Every derivation in `model.js` is a fold over
a tree, every verdict in `_recognizePhysicalLayer` is a reachability claim over a
graph, and both are already headless and golden-tested. That is a reusable
method with one instance so far.

**Minimal next step.** Read
`.development/reference/engine-robustness-and-extraction.md` (the robustness
audit, the landscape survey, and the seam-by-seam extraction map). Then make the
three decisions it ends with: the second domain, data-driven core before or after
the split, name and scope. Nothing is extracted until then.
