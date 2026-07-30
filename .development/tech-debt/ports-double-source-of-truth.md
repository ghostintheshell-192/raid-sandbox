---
type: code-quality
priority: low
status: open
discovered: 2026-07-30
related: []
related_decision: null
---

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
