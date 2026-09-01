---
type: code-quality
priority: low
status: resolved
discovered: 2026-07-30
related: [headless-tests-bypass-port-validation.md]
related_decision: null
---

> **Resolved 2026-09-02** on `refactor/physical-model-in-engine` — see the
> resolution sections at the end.

# Component ports are defined twice, and the two environments read different copies

## Problem

Every physical component's ports exist in two places: the hard-coded `COMPONENTS` table
in `src/sandbox/physical-controller.js` and the `ui.ports` block in its
`data/components/*.yaml`. Today the two are byte-for-byte identical. Nothing keeps them
that way.

If they ever diverge, the split is silent and environment-dependent: in the browser,
`loadComponentDefs` overwrites the hard-coded ports wholesale with the YAML's
(`physical-controller.js`, the `existing.ports = def.ui.ports` path), so the YAML wins;
headless Node code never calls `loadComponentDefs`, so the tests keep asserting against
the hard-coded table. A port-type change made in only one copy passes the suites and
behaves differently in the browser — no error anywhere.

## Analysis

The duplication is a consequence of the zero-dependency test discipline: headless suites
must run without YAML parsing, so the JS table cannot be dropped in favour of the YAML.
The risk is not the duplication itself but the absence of any check that the copies
agree.

## Possible Solutions

- **Option A**: a consistency test — `challenge-data.test.js` already reads real YAML via
  python3/pyyaml for exactly this kind of validation; a sibling test can compare each
  YAML's `ui.ports` against the hard-coded table and fail on any mismatch. Keeps both
  copies, makes divergence loud.
- **Option B**: make the JS table the only source and strip `ui.ports` from the YAMLs.
  Loses the data-file completeness (the YAMLs are written as the standard, waiting
  format — see the project's data-files stance).
- **Option C**: generate the JS table from the YAMLs at commit time (like
  `ARCHITECTURE.md`). Heavier machinery than the problem warrants today.

## Recommended Approach

Option A — it fits the existing test pattern exactly and costs one file. Natural moment:
the ADR-001 implementation branch, which touches every port definition anyway.

## Notes

Found during the physical-model fidelity audit
(`.development/reference/physical-model-fidelity.md`, §3). The same audit found the
orphaned `pcie-raid` entry in `COMPATIBLE` — remove it in the same pass.

## Related Documentation

- **Spec**: `.development/reference/physical-model-fidelity.md` §3
- **Code Locations**: `src/sandbox/physical-controller.js` (`COMPONENTS`,
  `loadComponentDefs`, `COMPATIBLE`), `data/components/*.yaml` (`ui.ports`),
  `tests/challenge-data.test.js` (the YAML-reading test pattern to copy)

## Solution Implemented

Neither Option A nor B as written: the JS table left `src/` altogether. The
component definitions and the port-type relation are now DATA only —
`data/components/index.yaml` (a `components` list plus a directional `portTypes`
relation, `pcie-raid` gone) and each component's top-level `ports:` block (moved
out of `ui:`, because ports are model, not presentation). `src/engine/catalog.js`
indexes a parsed manifest into a catalogue; the browser builds it from the YAML
(`PhysicalController.loadCatalog`) and hands it to the state; the renderer and
the wiring check read the catalogue and nothing else.

The zero-dependency headless suites still cannot parse YAML, so they get a JS
mirror — but as a **test fixture** (`tests/fixtures/components.js`), not a second
runtime copy, and `tests/components-data.test.js` (python3 + pyyaml, the pattern
Option A pointed at) asserts fixture and YAML agree on every model field: ids and
order, `provides`, `ports` (dir, type, `accepts`), `portTypes`. A divergence is a
red test, never a silent split between the two environments.

## Testing

`node tests/components-data.test.js` (31), `node tests/catalog.test.js` (13);
the whole suite via `.development/automation/test.sh` (13 suites green,
2026-09-02).

## Impact

The physical layer has one source of truth and the engine can read it, which is
what lets `cpConnect` validate at all (`headless-tests-bypass-port-validation.md`,
resolved in the same pass) and what the next step — deriving the hardware/fake/
software verdict from declared capabilities instead of hard-coded ids — builds on.
There is no hard-coded fallback any more: if the catalogue fails to load, the
physical panel says so instead of drawing from a stale table.
