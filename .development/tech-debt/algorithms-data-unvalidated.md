---
type: bug
priority: medium
status: resolved
discovered: 2026-09-04
related: []
related_decision: reference/decisions/002-the-engine-holds-no-domain-facts.md
---

# Three algorithm data files do not parse, and nothing would have noticed

> **Resolved 2026-09-04** on `fix/algorithms-data-unvalidated` (Option C) — see the
> resolution section at the end.

## Problem

Three of the seven files in `data/algorithms/` are not valid YAML:

- `left-asymmetric.yaml`
- `raid10-near.yaml`
- `raid10-far.yaml`

They have been broken for an unknown length of time, and no test, no loader and no
page reports it.

## Analysis

The cause is identical in all three: a list item containing a colon followed by a space,
unquoted.

```yaml
cons:
  - Worse sequential-read locality than left-symmetric: data segments do not
    rotate smoothly across all disks
```

YAML reads `- Worse … left-symmetric: data segments do not` as a mapping, then fails on
the continuation line.

**Why nobody noticed** is the more important half. There are data tests for components
(`components-data.test.js`), levels (`raid-levels-data.test.js`) and challenges
(`challenge-data.test.js`). There is none for algorithms — because nothing loads
`data/algorithms/` at all: `layout.js` implements the placement rules in code, bound to
the Linux `md` source by the golden tables, and the files were written as the eventual
data form of the same knowledge.

Content nobody reads is content nobody checks. The breakage and the silence are the same
fact (`reference/unspoken-content.md`).

## Possible Solutions

- **Option A**: quote the offending strings, nothing else. Fixes the files; leaves the
  same trap open for the next edit.
- **Option B**: quote them **and** add `tests/algorithms-data.test.js` on the pattern of
  the other three data tests (python3 + pyyaml, since the repo is dependency-free and
  Node has no YAML parser). Any file that stops parsing then fails a suite.
- **Option C**: B, plus assert the fields the family is expected to carry (`id`, `name`,
  `placement`, `appliesTo`, `linuxConstant`), so a half-written file is caught too.

## Recommended Approach

**Option C.** The extra assertions cost a few lines over B and they are what makes the
test a contract rather than a syntax check. Note the ordering trap: writing the test
first, watching it fail on three files, then fixing them, is the honest sequence.

## Notes

Independent of everything else on the roadmap — it touches no engine code and no UI, so
it can land at any time.

Do **not** wire `data/algorithms/` into the game as part of this fix. That is a separate
decision (spec §5b's parametric algorithm registry, deliberately deferred: placement is a
computation bound to the golden tables, not a fact about an object).

## Related Documentation

- **Census**: `reference/unspoken-content.md` — "Algorithms — the whole family is unread"
- **Spec**: domain-model §5b (algorithm resource schema, deferred)
- **Code Locations**: `data/algorithms/*.yaml`, `tests/components-data.test.js` (the pattern to copy)

## Resolution (2026-09-04)

`tests/algorithms-data.test.js` was written **first**, run, and confirmed to fail on
exactly the three files — then the files were fixed. A test that has never failed proves
nothing.

The fix was quoting, nothing else: the prose is teaching material and every word is
preserved verbatim. Six lines changed across three files.

The test parses each file individually rather than dying on the first bad one, so it
names *which* files are broken. It asserts `id` (matching the filename stem, unique),
`name`, `placement` and `appliesTo` on every file, and reads the real YAML through
python3 + pyyaml, like the other three data tests — the repo stays dependency-free.

**One correction to this document's own analysis**: it listed `linuxConstant` among the
fields the family is expected to carry. It is not universal. Only the four
parity-rotation files have one, because only they map to an `ALGORITHM_*` constant in
`drivers/md/raid5.h`; the three RAID10 files describe copy placement and never had one.
The test asserts it conditionally — present for parity algorithms, absent for the RAID10
ones — which turns the distinction into something a future edit cannot quietly break.

Candidates for a later tightening, present in all seven files but not asserted:
`convention`, `verificationStatus`, `description`, `pros`, `cons`, `source`, `default`.

`data/algorithms/` remains unwired from the game, as intended (spec §5b). The test proves
the files are valid data; it does not make them live.
