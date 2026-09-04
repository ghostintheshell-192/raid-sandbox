# Unspoken content — what the game knows and never says

**Date:** 2026-09-04
**Roadmap:** feeds item 2 (info icons) and item 3 (knowledge base)
**Companion:** [`refusal-points.md`](refusal-points.md) — where the game says no without saying why

The sandbox does not have a content problem. It has a **delivery** problem: most of the
teaching material is already written, in the data files, and no code path shows it to
anyone.

This document counts what is there, names two places where a data file promises a
behaviour the game does not have, and lists what is genuinely absent.

## The count

### Levels — 6 keys out of 17 reach the player

`data/raid-levels/` holds 14 level files. `levels.js` consumes six keys: `id`, `name`,
`notRaid`, `reason`, `shape`, `minDisks`. The other eleven are read by nobody:

| key | present in | what it holds |
|---|---|---|
| `description` | 14/14 | a paragraph explaining the level |
| `pros` | 13/14 | 2–3 concrete advantages |
| `cons` | 13/14 | 2–3 concrete costs |
| `useCases` | 14/14 | where the level actually belongs |
| `notFor` | 12/14 | where it does not |
| `note` | 6/14 | why this level is modelled the way it is |
| `capacityFormula` | 14/14 | the usable-capacity formula in words |
| `writePenalty` | 9/14 | random and sequential I/O per logical write |
| `faultTolerance` | 14/14 | the guaranteed number, as a fixed value |
| `defaultAlgorithm` | 11/14 | which layout the level assumes |
| `parity` | 1/14 | RAID 6's P and Q |

`faultTolerance`, `writePenalty` and `capacityFormula` are not silent in effect — the
engine derives all three on its own and shows them. They are *duplicates*, which is its
own risk, treated below.

The genuinely mute ones are the prose: `description`, `pros`, `cons`, `useCases`,
`notFor`, `note`. Six fields × fourteen levels, written and never displayed.

### Algorithms — the whole family is unread, and three files are broken

`data/algorithms/` holds seven files, with rich content: `description`, `pros`, `cons`,
`placement`, `convention`, `linuxConstant`, `linuxValue`, `reference`, `source`,
`verificationStatus`. **The game loads none of them.** `layout.js` implements the
placement rules in code, bound to the Linux `md` source by the golden tables; the files
were written as the eventual data form of the same knowledge.

Because nothing loads them, nothing validates them — and three of the seven do not parse
as YAML at all:

- `left-asymmetric.yaml`
- `raid10-near.yaml`
- `raid10-far.yaml`

The cause is the same in each: an unquoted list item containing a colon followed by a
space, e.g.

```yaml
cons:
  - Worse sequential-read locality than left-symmetric: data segments do not
    rotate smoothly across all disks
```

YAML reads that as a mapping and then fails on the continuation line. Quoting the string
fixes it.

**Why nobody noticed**: there are data tests for components, raid-levels and challenges;
there is no `algorithms-data.test.js`. Content that no one reads is content no one
checks — the silence and the breakage are the same fact.

Tracked as [`tech-debt/algorithms-data-unvalidated.md`](../tech-debt/algorithms-data-unvalidated.md).

### The knowledge base reads one file

`kb.js` loads `data/intro.yaml` and nothing else. None of the level or algorithm content
reaches it. What it shows is a short static reference: a headline, a summary, two storage
layers, two concepts (segmentation, redundancy) and four key parameters.

Two things follow from that:

- **The vocabulary diverges from the spec.** Spec §8 locks four levels — physical disks →
  drive group → span → Virtual Drive. `intro.yaml` presents two, and calls the first
  *"drive spans (physical layer)"*, which is the drive group's job under a span's name.
  Given that confusing span and group is a documented, real mistake — it happened to this
  project's author while building — the introduction is teaching the confusion.
- **One of its four "key parameters" does not exist in the game.** *Rebuild time* is
  presented as a thing to reason about; nothing computes or shows it. It is, in fact, the
  quantity behind the most important warning in `raid5.yaml`'s `cons`.

Both are tracked as [`tech-debt/kb-intro-diverges-from-spec.md`](../tech-debt/kb-intro-diverges-from-spec.md).

## Two promises the data makes and the game does not keep

These are different from the silence above: a file states that the game does something,
and the game does not.

**1. RAID 0+1 versus RAID 1+0.** `raid0plus1.yaml` says it twice:

> cons: *Strictly worse than RAID 1+0 at the same cost — **recognized so the sandbox can say so***
>
> note: *Recognized separately from RAID 1+0 because the two are often conflated and the
> difference (what a single failure takes down) is **exactly what the sandbox teaches**.*

The sandbox does not say so. And the reason it does not is worth stating precisely,
because the numbers hide it:

| | RAID 1+0 | RAID 0+1 |
|---|---|---|
| disks | 4 | 4 |
| usable capacity | 2 disks | 2 disks |
| `faultTolerance` shown | **1** | **1** |
| survives a *second* failure | 2 cases out of 3 | 1 case out of 3 |

Both guarantee one failure, so both display `1`, and that is the only number the player
sees. What it hides is that in 0+1 a dead disk takes its whole leg with it, so only the
other leg's disks are fatal — half the survival of 1+0, for the same disks and the same
capacity.

This matters beyond the two levels, because **inverting span and group is exactly how a
player builds 0+1 while believing they are building 10**. The conceptual mistake produces
a measurably worse array, and the game currently shows no difference at all.

Tracked as [`tech-debt/raid0plus1-difference-not-surfaced.md`](../tech-debt/raid0plus1-difference-not-surfaced.md).

**2. The write hole.** `os-linux.yaml`:

> *Without a battery-backed write cache (BBU) or UPS, a power loss during a write can
> leave the array in an inconsistent state. **This is a soft constraint surfaced as a
> warning in the game.***

There is no such rule; the validator has seven and none concerns power. Spec §5a had it
too, as *"needs UPS"*, from the beginning.

This one is worth more than a missing warning. It is the reason a hardware RAID
controller has a protected cache — that is, the reason the expensive object in the
physical layer is expensive. The game already models the RoC's protected cache as part of
what makes it a RoC (ADR-001); it never says what the cache protects against.

Tracked as [`tech-debt/power-loss-warning-promised-not-implemented.md`](../tech-debt/power-loss-warning-promised-not-implemented.md).

## The duplicated numbers

`faultTolerance`, `writePenalty` and `capacityFormula` exist both in the level files and
as engine derivations. Checked on 2026-09-04: **at each level's minimum disk count the
declared and computed fault tolerance agree in all 14 cases.** Nothing guarantees they
keep agreeing — `raid-levels-data.test.js` checks that the fields exist and are internally
plausible, never that they match what the engine computes.

There is also a subtler mismatch already present. The declared number is a **fixed value**;
the real one depends on the build:

| build | file says | engine computes |
|---|---|---|
| RAID 1, 2 disks | 1 | 1 |
| RAID 1, 3 disks | 1 | **2** |
| RAID 1, 4 disks | 1 | **3** |

The engine is right and the panel shows the engine's number, so nothing is broken today.
But the file's value is the level's *minimum*, not the array's tolerance — and the moment
that field is displayed as-is, it starts lying. Whoever wires up the level prose should
take the prose and leave these three numbers alone.

Tracked as [`tech-debt/level-numbers-duplicated-untested.md`](../tech-debt/level-numbers-duplicated-untested.md).

## What is genuinely absent

Everything above is content that exists. This is content that does not, drawn from
general RAID knowledge rather than from this repository.

**Caveat, and it matters here**: this list comes from an LLM's training, not from a
primary source. Under this project's ground-truth discipline it is a list of *candidates
to verify* — the same status as ADR-001's hardware claims, which are still marked
unverified. Nothing here should become player-facing text before it is checked.

| concept | why it belongs in a teaching sandbox |
|---|---|
| **RAID is not a backup** | it protects against a disk failing, not against deletion, ransomware, silent corruption or losing the site. The data files say *"never use RAID 0 for anything you cannot afford to lose"* and list *"archival and backup storage"* as a use case, but never state the general frame. For a game that teaches RAID to beginners this may be the single most important sentence, and it is not anywhere |
| **Why parity rotates** | RAID 4 put parity on a dedicated disk, which became the bottleneck of every write. The sandbox offers four rotation algorithms and never says what rotation is *for*. RAID 4 appears in no file |
| **Scrubbing / patrol read** | the mechanism that finds latent bad sectors *before* a rebuild needs them. It is the direct answer to the rebuild risk `raid5.yaml` already warns about, and the word appears nowhere |
| **Strip size and stripe size** | the parameter a person configuring a real controller must choose, and the one that decides whether a workload fits the array. Spec §8 defines both; no data file mentions them |
| **Degraded-mode performance** | a RAID 5 with one dead disk is not "a bit slower": every read touching the missing disk must read all the others and recompute. Belongs to the runtime axis (roadmap item 7), where the player breaks a disk and watches |

## What this means for the roadmap

Item 2 (info icons) was scoped in July as *"identify every point that needs explaining"*.
That inventory is now largely answered from the other direction: the points that need
explaining are the ones whose text is already written and unreachable. The work is a
channel, not a writing job.

Item 3 (knowledge base) inherits three things this census found: the level prose that
never reaches it, a vocabulary that contradicts spec §8, and a key parameter it advertises
and the game cannot compute.

And one small repair does not need to wait for either: the three algorithm files that do
not parse, plus the missing `algorithms-data.test.js` that would have caught them.

Everything actionable in this census is tracked as tech debt — five new entries, listed in
[`tech-debt/README.md`](../tech-debt/README.md). What stays here is the map: the counts,
the two broken promises, and what is genuinely absent.
