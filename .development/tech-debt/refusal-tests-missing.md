---
type: testing
priority: low
status: resolved
discovered: 2026-09-04
related: []
related_decision: null
---

# Three refusals have no test

> **Resolved 2026-09-04** on `test/refusal-coverage` (Option A) — and one of the three
> turned out to be covered already. See the resolution section at the end.

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

## Resolution (2026-09-04)

**Two tests, not three.** The first row of the table above was wrong.

`cpCanConnect` with no catalogue **was already tested**, in `canvas-state.test.js` [13d]
(*"without a catalogue nothing can be wired, and it says so"*), added 2026-09-02 with the
physical-model refactor — two days before this entry claimed it was missing. No duplicate
was added.

How the census got it wrong is the part worth keeping: it searched the suites for the
refusal's **message string** (`no catalogue loaded`), and the existing test asserts only
`/catalogue/`. Grepping for the wording measures the wording, not the behaviour.

The two that were genuinely missing:

| test | suite | why there |
|---|---|---|
| `an unknown segmentation is refused` · `an unknown redundancy is refused` | `model-recognize.test.js`, section "Guards — array() refuses unknown vocabulary" | the suite that builds `M.array()` / `M.disk()` trees directly, where the factory is the thing under test rather than incidental |
| `recognize() throws when the catalogue declares no roles.sink.capability` | `canvas-state.test.js` [13g] | the suite that already exercises `physical.js`; the guard fires before any graph data is read, so it is called directly with a sinkless catalogue rather than through a full `evaluate()` |

Each asserts the **message**, not merely that something threw — a bare throw-check passes
on the wrong error.

**Verified by breaking it.** The guard in `physical.js`'s `sinkRole()` was temporarily
replaced with a silent `{}` fallback; `canvas-state.test.js` then failed exactly one test
(*"expected Physical.recognize to throw"*, 63 passed / 1 failed) and nothing else. The
source was restored — `git diff -- src/` empty, 64 / 0 again.

**Left alone, noted here**: the pre-existing catalogue test asserts `/catalogue/` where
the house style elsewhere pins more of the message (`catalog.test.js` uses
`/unknown component "ghost"/`). A regression that kept the word and changed the rest would
slip through. Too small to reopen an entry for; worth tightening whenever that file is
next edited.
