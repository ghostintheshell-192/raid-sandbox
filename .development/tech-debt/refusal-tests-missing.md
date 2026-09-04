---
type: testing
priority: low
status: open
discovered: 2026-09-04
related: []
related_decision: null
---

# Three refusals have no test

## Problem

The census in `reference/refusal-points.md` found the refusal coverage to be strong and
consistent — three suites carry a dedicated block with the same shape ("… fails fast,
naming the piece") and a shared `failsWith` / `refuses` helper. Three refusals are
missing from it.

## Analysis

| refusal | where | why it matters |
|---|---|---|
| no catalogue loaded | `cpCanConnect` returns *"no catalogue loaded — nothing can be wired yet"* | the state before the YAML arrives; a regression here would surface as wires forming against nothing |
| unknown segmentation / redundancy | `model.js` throws | the only guard on the data-layer vocabulary |
| `roles.sink.capability` missing | `physical.js` throws — *"the recognizer needs to know where the path ends"* | checked against the real manifest in `components-data.test.js`, never as a refusal on a malformed one |

The third is the interesting one: the field is verified to *exist* in the shipped data,
which is a different assertion from "the engine refuses a manifest without it". The first
protects the data; only the second protects the engine.

## Possible Solutions

- **Option A**: three tests, following the existing blocks (`catalog.test.js` [3],
  `levels.test.js` [2], `build-document.test.js` [2]).
- **Option B**: A, and factor the `failsWith` helper into `test-helpers.js`, since three
  suites now carry near-identical copies.

## Recommended Approach

**Option A**, and B only if a fourth copy appears. Three small duplicates in
dependency-free suites are cheaper to read in place than to trace to a shared helper.

## Notes

Small and self-contained; no engine change. Good work to pair with any other change to the
same files.

## Related Documentation

- **Census**: `reference/refusal-points.md` — "What is missing"
- **Code Locations**: `src/sandbox/canvas-state.js` (`cpCanConnect`), `src/engine/model.js`, `src/engine/physical.js`, `tests/catalog.test.js` (the pattern)
