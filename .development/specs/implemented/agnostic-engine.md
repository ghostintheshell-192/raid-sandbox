# The agnostic engine — how the domain moved out of the code

**Status:** IMPLEMENTED — five steps merged to `main` on 2026-09-02, plus a sixth (the
§6 constraints) on 2026-09-05
**Decision:** [ADR-002](../../reference/decisions/002-the-engine-holds-no-domain-facts.md)
**Origin:** the audit [`reference/engine-robustness-and-extraction.md`](../../reference/engine-robustness-and-extraction.md) (2026-09-01)
**Realises:** domain-model spec §5, §5a, §5c (see §5d for the plan in short)

ADR-002 says *why* the engine holds no domain facts. This document says **how** that was
done, so the shape is recoverable without reading the code.

## What changed, in one table

Each row is a fact the game needs. Before, the engine knew it. Now, the engine reads it.

| The fact | Lived in | Lives in |
|---|---|---|
| Which components exist, and their labels, icons, badges | a `COMPONENTS` table in `physical-controller.js` | `data/components/*.yaml` |
| Which port can connect to which | a `COMPATIBLE` table in JavaScript | `portTypes:` in `data/components/index.yaml` |
| Where a disk of a given protocol may land | a function that knew the word "backplane" | `accepts:` on the ports that take disks |
| Hardware vs. fake vs. software RAID | component ids compared in code | a `verdict:` block in each engine object's file |
| Which shape is which RAID level | a hand-written recognizer function | `shape:` in `data/raid-levels/*.yaml` |
| How many disks a level needs | a `MIN_DISKS` constant | `minDisks:` in the level's file |
| Why a level is what it is (the "why" text) | strings in code | `reason:` in the level's file |
| Which array layouts exist only under one engine | a `MDADM_LAYOUTS` set + `os === 'os-linux'` in `validator.js` | `layout:<algorithm>` in that engine's `provides:`, explained by its `layouts.reason` |
| Where a disk of a given protocol may NOT land | `protocol === 'NVMe' && target === 'backplane'` in `validator.js` | the same `accepts:` the catalogue enforces, read back |

## How it works now

One path, three stages:

```text
data/*.yaml  →  catalogue  →  engine
```

1. **The files describe the objects.** A component says what ports it has, what it
   provides, what its ports accept, and — if it is a RAID engine — what verdict it
   carries. A level says its shape, its minimums and its explanatory text.
2. **The catalogue assembles and validates them.** `src/engine/catalog.js` builds the
   component catalogue; `src/engine/levels.js` builds the level catalogue. They index the
   files, check them, and expose the questions the engine asks — *can this port reach
   that one?*, *who accepts an NVMe disk?*, *which level matches this shape?*
3. **The engine works on the catalogue, never on the files.** `physical.js` derives the
   RAID type, `model.js` recognizes the level, `validator.js` checks the constraints —
   none of them names a component or a level.

In the browser, `src/sandbox/data-loader.js` is the single fetch-and-assemble path for
every resource family. The headless tests get the same catalogue from JS mirrors in
`tests/fixtures/`, kept honest by data tests that read the real YAML.

## The steps

Each was a branch, tried in the browser by Valentina, then merged.

**1 — The physical model moves into the engine** (`refactor/physical-model-in-engine`)

The pieces, their ports and their compatibility left the DOM controller and became engine
data. Three consequences worth keeping in mind:

- ports moved to the root of each component file, because they are *model*, not UI;
- the engine can now **refuse** a connection instead of trusting the caller: `cpConnect`
  validates against the catalogue and throws on an impossible wire;
- `evaluate()` became pure — disk auto-routing moved out of it and into the mutations, so
  "disks are always routed" holds after every change rather than being repaired at
  evaluation time.

**2 — The verdict comes from the object** (`refactor/verdict-from-capabilities`)

The recognizer stopped comparing ids. An engine object is any non-sink component carrying
a `verdict:` block, read in catalogue order; the OS files carry the software verdict for
the case where no engine object is on the path. This is ADR-001 taken one step further:
identity still decides, but the object states its own identity.

The HBA gate disappeared entirely — with typed ports it is structural, so no rule was
needed. And the acceptance test arrived immediately: the tri-mode controller
(`engine-roc-trimode.yaml`) was **one file, no engine change**, closing
`nvme-hardware-raid-unbuildable`.

**3 — The recognizer reads shapes** (`refactor/recognizer-from-shapes`)

`src/engine/levels.js` matches a composed tree against the `shape:` declared in each
level file — `members: disks|arrays`, `constraint: even/odd-disk-count`, `childShape` for
nested levels.

The old hand-written function was not deleted on faith: it was kept as an **oracle** in
`tests/levels-oracle.test.js`, and the two were compared over 849 enumerated trees. They
agreed everywhere except two cases, where the new one is stricter on purpose:

- a *striped* mirror over spans is no longer called RAID 51/61/0+1 — the files say it is a
  mirror of legs;
- a stripe or a mirror over `linear + parity` spans (which have no standard name) is no
  longer called RAID 50/60/51/61.

The old code named those by laxity. Both tightenings were confirmed in the browser.
`raid0plus1.yaml` was added along the way: RAID 0+1 had been recognized in code since the
combinations phase without ever having a file.

**4 — A build becomes a document** (`feature/build-document`)

`src/sandbox/build-document.js` serializes a build and loads it back. The document holds
what the player did — disks, arrays, components, hand-drawn cables, positions — and
**never** the derived edges or the derivations themselves: those are recomputed, so a
document can never disagree with the engine.

It rides in the URL as `#build=…`, which makes builds shareable (the ⧉ Share button). Node
ids became per-document rather than per-module, so a loaded build is identical to the one
that was saved. A document the catalogue cannot honour is refused by name, leaving the
canvas empty rather than half-built.

**5 — Types on the interfaces** (`chore/ts-check`)

`// @ts-check` plus JSDoc typedefs in `src/engine/types.js` (a file never loaded at
runtime). Zero expressions changed — comments only. `jsconfig.json` keeps `checkJs` off so
files opt in one at a time; `bash .development/automation/typecheck.sh` runs it. The CI job
is not a required check, because it needs the network for `npx`.

**6 — The constraints read the catalogue too** (`refactor/validator-facts-in-data`, 2026-09-05)

A late addition, after the five: the §6 rules were the last place in the engine that named
components. Two of them did, and both now ask a catalogue instead.

- **Cross-axis near/far/offset.** The rule held a list of the three mdadm layouts and the
  test `raidType === 'software' && os === 'os-linux'`. Both facts moved into
  `os-linux.yaml`: it claims `layout:near`, `layout:far`, `layout:offset` in its
  `provides:`, and carries the sentence to show in a `layouts.reason` (a `{label}` /
  `{algorithm}` / `{raidType}` template, the same convention as a level's `{n}`). The rule
  is now a comparison and nothing else — *does the engine on this path claim the layout
  the array asked for?* A layout no component claims is unrestricted, so `left-symmetric`
  and the other parity rotations need no entry anywhere. The half the rule was missing is
  in `physical.js`: `buildView` now reports `engineComponentId`, **which** object's verdict
  the path carries — the RoC on a hardware path, the OS on a software one. Asking that
  object what it offers is a sharper question than reading the `raidType` string.
- **`nvme-backplane`.** Kept, not retired, and generalised: it reads the catalogue's
  `accepts:` relation, so it guards the fact the catalogue enforces instead of restating
  it. It is still structurally dead (`cpAutoRoute` only routes disks to acceptors) and
  still a guard against a routing regression. Its code stays `nvme-backplane` because five
  documents cite it by that name; its message is now derived from the data and no longer
  names a protocol and a component in code.

`validate(tree, physical, { levels, catalog })` — the component catalogue goes in the way
the level catalogue always did. Both are optional: with no catalogue the rules that need
one stand down rather than guess.

## Two lessons from the checkpoints

Both were found by Valentina trying the thing in a browser, and both generalise:

- **A loader that assembles data by hand is outside the test coverage.** The browser
  loader built the manifest itself and quietly dropped `roles`, so the recognizer threw
  only on a complete build. The fix was structural: `RaidCatalog.assemble` is now the one
  assembly path, used by the loader and by the data tests alike.
- **A stale test page looks exactly like a broken engine.** `tests/model.test.html`
  expected a result the engine had changed months earlier. The page was behind, not the
  code. Test pages need the same maintenance as tests.

## What the engine still holds

Recorded in ADR-002 as known exceptions, repeated here so the next reader does not have
to guess whether they were missed:

- `layout.js` keeps the placement algorithms in code, deliberately: how parity rotates is
  a computation bound to the Linux `md` source by the golden tables, not a fact about an
  object.
- In `validator.js`, only vocabulary and identifiers: the capability prefix `layout:`, and
  the rule codes `nvme-backplane` and `backplane-diversity`. Those two codes are stable
  ids other documents cite, not facts the engine reasons with — but
  `backplane-diversity` is still a dormant rule named after a component, and is worth
  renaming when the diversity module (§9.4) gives it a body.

## Verification

17 headless suites green, `typecheck.sh` clean, and each step tried in the browser before
merging. The step-by-step diary — every checkpoint, every correction found in the browser
— is the living plan `2026-09-02-0045-agnostic-engine-refactor-plan.md`, local to
`.memory-bank/`; this document is what survives it.
