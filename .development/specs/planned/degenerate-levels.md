# Degenerate levels — what the player has, next to what they tried to build

**Status:** planned — decided 2026-09-04, not yet implemented
**From:** `.memory-bank/ideas/2026-09-04-degenerate-levels.md` (the capture; this file supersedes it)
**Builds on:** domain model §1 (the level is derived, never selected), §4 (recognition ≠ validation), §6 (constraints); [ADR-002](../../reference/decisions/002-the-engine-holds-no-domain-facts.md)
**Ground truth:** `drivers/md/raid5.c` (Linux `md`), and the algebra of parity

## 1. The case

A player builds a RAID 5 with two disks. Today the game says: *RAID 5 — needs at least 3
disks, has 2*. That is true and it is the least interesting thing that can be said.

With two disks, the parity of a stripe is the parity of a single data block, and the
parity of one block is the block itself: `P = D0`. The second disk holds an exact copy of
the first. **The player built a mirror.** Structurally it is a RAID 5 with two disks;
behaviourally it is a RAID 1. Both are true, at different levels, and the teaching lives
in the gap between them — it is what a good teacher stops the class for.

Below its minimum width, every level collapses into a simpler one, and the game names
only what was composed. This spec adds the other half.

## 2. The principle, doubled

Spec §1 says the level is derived from the tree, never selected. This proposal does not
weaken that; it applies it twice. The same tree is read two ways:

| box | reads the tree for | answers |
|---|---|---|
| **1 — what you are trying to build** | its *form* | the recognizer, unchanged |
| **2 — what you actually have** | its *behaviour* | new — derived, not chosen |

Nothing is selected in either. Errors surface as the **difference** between the two boxes,
instead of as separately authored warnings.

## 3. The cases, and what the kernel says about them

| composed | box 1 | box 2 | the kernel |
|---|---|---|---|
| `striped + parity1`, 2 disks | RAID 5 | a mirror (`P = D0`) | **runs it**. `raid5_takeover_raid1()` converts a 2-disk RAID 1 into a 2-disk RAID 5 in place, setting `ALGORITHM_LEFT_SYMMETRIC` — no data moves. The kernel itself asserts the two layouts are the same |
| `striped + parity2`, 3 disks | RAID 6 | a three-way mirror (`P = D0`, `Q = g⁰·D0 = D0`) | **refuses it**. `setup_conf()`: *"not enough configured devices (%d, minimum 4)"* |
| `striped + mirror`, 2 disks | RAID 10 | a RAID 1 (two copies, nothing to stripe across) | runs it (it is a RAID 1) |

Two different kinds of "degenerate" are in this table, and the spec keeps them apart:

- a **collapse** — the build runs, and behaves as a simpler level;
- a **refusal by the real system** — the build does not start, whatever it would have
  behaved like.

RAID 6 with three disks is both at once: it *would be* a three-way mirror, and Linux will
not start it. Both facts are shown (§8).

The collapse **composes**. A RAID 50 whose spans have two disks each is two mirrors,
striped: a RAID 10. A RAID 51 with two-disk spans is a mirror of mirrors: a four-way
RAID 1. Nested cases are not listed anywhere; they follow from the leaf cases and the
recursion, which is a hard requirement on the design below.

## 4. How box 2 is derived: rewrite, then recognise

Box 2 is not computed independently of box 1 and then compared to it. It is produced
*from* the composed tree by a series of rewrites, and **the list of rewrites that fired
is the diff**.

```text
composed tree        striped+parity1 over [d0, d1]
   ↓  rule: "the parity of a single block is the block"      ← this line is the diff
normalised tree      linear+mirror over [d0, d1]
   ↓  the existing recognizer
box 2                RAID 1
```

- Rewrites apply **bottom-up**: leaves first, then their parents. This is what makes the
  nested cases free — the RAID 50 above collapses into a RAID 10 with two diff lines, one
  per span, and no rule about RAID 50 exists.
- **No second recognizer, no new levels.** The normalised tree is named by the catalogue
  that already exists. When it has no standard name, box 2 says exactly what the
  recognizer says today — *valid, non-standard* — and describes the shape (§7).
- When nothing collapses, the diff is empty and both boxes say the same name. That is
  information, not silence: *what you built is what you have*.

The diff is a trace, in the way a compiler keeps a log of the simplifications it applied.
It is not a function of two names.

## 5. The data: `collapsesTo`, and two minimums

Per ADR-002 the rules are data. They live on the level file whose shape they narrow,
because a level's minimum and its collapse are one fact seen from two sides: `minDisks`
says *where* the level stops being itself, `collapsesTo` says *what it becomes* and *why*.

```yaml
# data/raid-levels/raid5.yaml
minDisks: 3            # the canonical minimum: below it, this is no longer a RAID 5
minDisksToRun: 2       # the minimum the real system starts
minDisksToRunSource: "drivers/md/raid5.c — raid5_takeover_raid1() accepts exactly 2 devices; mdadm creates 2-device RAID 5"

collapsesTo:
  - disks: 2
    becomes: { segmentation: linear, redundancy: mirror }
    because: "the parity of a single data block is the block itself — the second disk holds a copy"
    source: "drivers/md/raid5.c raid5_takeover_raid1(): the kernel converts a 2-disk RAID 1 to a 2-disk RAID 5 in place"
```

```yaml
# data/raid-levels/raid6.yaml
minDisks: 4
minDisksToRun: 4
minDisksToRunSource: "drivers/md/raid5.c — setup_conf(): 'not enough configured devices (%d, minimum 4)'"

collapsesTo:
  - disks: 3
    becomes: { segmentation: linear, redundancy: mirror }
    because: "with one data block per stripe both P and Q are that block — three copies"
    source: "algebra: P = D0; Q = g⁰·D0 = D0"
```

The fields:

| field | meaning | required |
|---|---|---|
| `minDisks` | the canonical minimum — the level's definition. Unchanged | yes (exists) |
| `minDisksToRun` | the minimum the real system accepts. A fact, with a source | leaf levels: yes, with `minDisksToRunSource` |
| `collapsesTo[]` | one entry per width below `minDisks` that is worth explaining | leaf levels: see the coverage rule |
| `.disks` | the width the entry is for | yes |
| `.becomes` | the shape the node is rewritten to | yes |
| `.because` | the player-facing sentence | yes |
| `.source` | kernel citation or algebra — the ground truth for this rule | yes |

**Coverage rule** (a data test): every width from `minDisksToRun` up to `minDisks − 1`,
and at least 2, *that has the level's shape* has a `collapsesTo` entry — otherwise a
configuration exists that runs and the game cannot explain. The shape clause is the
disk-count constraint: three disks never have RAID 10's shape (even), they are RAID 1E's,
so RAID 10 owes no entry at 3 and an entry there could never fire (`levels.js` refuses it). Below `minDisksToRun` an entry is optional and useful
(RAID 6 with 3 disks: *it would be a three-way mirror, and Linux does not start it*).

**Leaf levels only.** A nested level (`members: arrays`) declares none of the three keys,
and `levels.js` refuses them there: its collapse *is* the recursion of §3 — the spans
carry the rule, and a copy on the outer level would be the same fact stated twice, free
to drift. Where nothing runs below the minimum (JBOD, RAID 0, RAID 1: the universal
≥ 2 is structural) `minDisksToRun` equals `minDisks` and the source says so; RAID 1E
likewise, since the only width below 3 is even and belongs to RAID 10's shape.
Implemented 2026-09-05 (data, validation, coverage test).

**`minDisksToRun` is implementation-dependent.** The numbers above are `md`'s. A hardware
controller has its own minimums, known only from vendor documentation — the same
unverified status as ADR-001's hardware claims. v1 declares the `md` numbers; in
prospect this field is a *cross-axis* rule (like near/far/offset existing only under
Linux), not an attribute of the level. Not solved here; written down so it is not
forgotten.

**Precedent in the catalogue.** `constraint: even-disk-count / odd-disk-count` on
RAID 10 and RAID 1E is already a declaration that *the count changes the name*.
`collapsesTo` generalises it: there the count chooses between two levels, here it
rewrites the shape.

Why not elsewhere:

- *a relation graph between levels* (`raid5 → raid1 at 2`) is the right picture to draw,
  but the relation is between **shapes**, not names — the rule must also apply to a span
  inside a RAID 50, where nobody has said "RAID 5" yet;
- *a fourth resource family* (`data/collapses/`) is cleaner in the abstract and heavy for
  four or five rules. Kept in reserve for a rule whose input shape is not a level.

## 6. The content algebra — the parallel derivation

Declared rules are a list of what someone already worked out; they discover nothing.
The project's answer to that, once already, was an oracle: `levels-oracle.test.js` keeps
the old hand-written recognizer and runs it against the data-driven one over 849
enumerated trees. This spec adds the same thing for collapses, from the opposite
direction — **the mathematics of the structure**.

`layout.js` gives every cell a role and a segment. One layer above it gives every cell its
**symbolic content**, a vector over the data segments of its stripe:

| cell | content |
|---|---|
| data, segment 3 | `{3: 1}` |
| P of a stripe holding segments 0, 1, 2 | `{0: 1, 1: 1, 2: 1}` — the XOR |
| Q of the same stripe | `{0: g⁰, 1: g¹, 2: g²}` |
| P of a stripe holding segment 0 alone | `{0: 1}` — **it is D0** |
| Q of the same | `{0: g⁰}` = `{0: 1}` — **it is D0** |
| a mirror cell of segment 3 | `{3: 1}` |

No Galois-field arithmetic is needed: only that `g⁰ = 1`, that `gⁱ ≠ gʲ` for `i ≠ j`,
and that a combination of two or more terms is never a single block. From the contents:

- two cells on different disks with the same content are **copies** — by content, not by
  position, so `far` (same content, different cells) is a mirror like `near` is;
- the number of copies per segment, the distinct segments per stripe, and the cells whose
  content has two or more terms (real parity) describe the behaviour of the array with
  **no names at all**: *"2 disks, every block in 2 copies, no parity"*.

On the three cases: RAID 5 @ 2 → 2 copies, no parity. RAID 6 @ 3 → 3 copies, no parity.
RAID 10 @ 2, `near` or `far` → 2 copies, no parity.

**What it is for.** Two derivations that must agree, produced in opposite ways: one from
the declared data, one from the algebra. The test enumerates the small trees (for each
level, widths from 2 to `minDisks − 1`; the nested shapes the oracle already builds),
asks the algebra what collapses, and fails naming:

- every collapse the algebra finds with no `collapsesTo` declaring it;
- every `collapsesTo` the algebra contradicts.

This is also the answer to the jungle. Nobody has to *imagine* which relations exist: the
test prints the ones that are true, and a human writes only the sentence and the source.

**Its limit, kept explicit.** Equivalence of content is not identity. A two-disk RAID 5
and a RAID 1 put the same data in the same places and are not the same object: the kernel
treats one as RAID 5 (XOR computed for nothing, a RAID 5 growth path). The algebra proves
*"the data lands identically"*, which is part of the truth. The other part — what a real
system does with it — is the `source:` on the declared rule.

**Where it lives.** The core (symbolic content, equality classes, copy counting) knows
nothing about RAID. The RAID-specific part is *how a role derives its content* — data is
itself, P is the XOR, Q carries `gⁱ` — and that sits next to `layout.js`, which is
already ADR-002's declared exception: the placement algorithms stay in code because the
golden tables bind them to the kernel. The content algebra extracts with the engine along
the same seam.

## 7. Runtime: declared rules run, the algebra tests them

Decided 2026-09-04. Functionally the two are the same — the space is finite and
enumerated, so the test *is* the computation done in advance, and what reaches runtime is
the already-verified result. For a browser page with no build step, the lighter game is
the right one. Running the algebra in the game (box 2 reading the plate for shapes nobody
declared) is a possible second step, not this one.

Box 2 at runtime therefore shows:

1. **what is on the plate** — the normalised tree, described without names. Trivially
   derived from the normalised tree itself (copies, stripe width, parity terms);
2. **the numbers** — capacity, fault tolerance, write penalty, throughput classes, all
   computed on the *normalised* tree;
3. **what it would be called** — the recognizer on the normalised tree; or *valid,
   non-standard* when the catalogue has no name for it.

**The numbers belong to what runs.** The form has no numbers; the behaviour has. This
avoids two contradicting write penalties on one screen — the composed tree gives RAID 5's
4 I/Os, the normalised one a mirror's 2 — which is the same contradiction the animation
gate removed on 2026-09-04 (*"✓ build valid"* above a hard violation). When nothing
collapses the trees coincide and the panel is unchanged from today.

The diff, under the boxes, lists each rewrite with its `because`, and may also state the
numbers that changed (*write penalty 4 → 2: a single-block parity needs no read*).

## 8. What this does to §6

`min-disks` is today one hard rule. The table in §3 shows it is two facts:

| below the minimum, the build… | severity | who explains |
|---|---|---|
| **collapses** (RAID 5 @ 2, RAID 10 @ 2) | soft | the diff — `because` |
| **does not start** (RAID 6 @ 3) | hard | a violation citing `minDisksToRunSource` |

So the rule splits: a collapse is a soft violation whose text is the `because` of the
rewrite; a width below `minDisksToRun` is a hard violation with the kernel as source.
Both can fire on one build (RAID 6 @ 3), and both are shown.

This fits the animation gate as decided: the reward waits on hard violations only. A
two-disk RAID 5 **animates** — and the animation shows the mirror. A three-disk RAID 6
does not, and the button says why.

`checkMinDisks` today skips levels whose minimum is 2 (the universal ≥ 2 is structural,
`_firstIssue`). With `minDisksToRun: 2` on RAID 5 the hard half never fires for it, which
is correct.

## 9. UI — to decide in the browser

Not decided here; the candidates, in order of how much they show rather than tell:

- **the grid itself.** The P cells of a two-disk RAID 5 already exist on screen; box 2
  relabels them — *= copy of D0* — and draws them with the mirror role. The diff becomes
  *the cells whose role changed between form and behaviour*, highlighted (`highlight.js`
  does exactly this job). The player watches the parity become a copy;
- **two boxes and a diff in words**, in the results panel, no change to the grid.

The first is the sandbox's own channel and the preference; whether it reads well is a
browser question.

## 10. Tests

- **The oracle** (§6): enumerated small trees, algebra vs. declared rules, both
  directions. Hand-derived rules, engine-verified — the golden-table discipline, not its
  inverse: the algebra never *generates* a `collapsesTo`.
- **Coverage** (§5): every runnable width below `minDisks` has an entry.
- **Data**: `minDisksToRun ≤ minDisks`; `source` present on every entry; `becomes` is a
  valid shape.
- **Recognition**: the three cases in §3 name the right level in box 2; the RAID 50 and
  RAID 51 compositions name RAID 10 and RAID 1.
- **Validator**: the split of §8 — soft on RAID 5 @ 2, hard on RAID 6 @ 3, both on a
  build that is both.

## 11. Open questions

1. **The write penalty of a two-disk RAID 5.** The engine's parity table says 4 I/Os
   (read-modify-write). With one data block per stripe `md` should need no read at all —
   cost 2, a mirror's. To verify in `raid5.c` (the rmw / rcw choice) before the number
   is shown; until then the diff shows the numbers of the normalised tree and says no
   more.
2. **`minDisksToRun` per implementation** (§5) — when the physical axis is asked.
3. **The names of the two boxes** on screen. Working titles: *what you are building* /
   *what you have*.

## 12. Out of scope

- The algebra at runtime (§7, second step).
- Hardware-controller minimums.
- Collapses that are not about width (a RAID 0+1 versus RAID 1+0 failure profile is a
  different axis — `tech-debt/raid0plus1-difference-not-surfaced.md`).

## 13. Where it touches the code

| piece | today | change |
|---|---|---|
| `data/raid-levels/*.yaml` | `minDisks` | `minDisksToRun`, `minDisksToRunSource`, `collapsesTo[]` |
| `src/engine/levels.js` | reads five keys | reads and validates the three new ones |
| `src/engine/model.js` | `recognize(tree)` | `normalize(tree, levels) → { tree, trace }`, bottom-up; `analyze` on the normalised tree |
| `src/engine/validator.js` | `checkMinDisks` hard | the split of §8 |
| `src/engine/content.js` (new, tests only) | — | the content algebra of §6 |
| `tests/` | `levels-oracle.test.js` | `collapses-oracle.test.js`, coverage in `raid-levels-data.test.js` |
| `index.html`, `render.js`, `highlight.js` | one level, its numbers | box 2 and the diff (§9, in the browser) |
| `types.js` | `LevelDef` | the new fields, `Trace` |
