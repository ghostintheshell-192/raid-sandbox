# ADR-002: The engine holds no domain facts — it reads them from data files

**Date**: 2026-09-04
**Status**: Accepted
**Impact**: high
**Summary**: The engine's code knows *how* to compose, recognize, validate and explain; it does not know *what* a backplane, a RAID-on-Chip or a RAID 5 is. Every domain fact — components, ports, verdicts, level shapes, disk minimums — lives in the YAML files and is read from there, so adding a capability is adding a file.

## Context

The project has a founding principle (domain-model spec §1):

> The RAID level is not selected. It is derived from what you compose.

Section §5 of the same spec extends it to the resource files: *adding a capability = adding a
file in the right family, ideally with no engine change.*

Until 2026-09-02 that promise held for the **derivations** and was broken for the
**facts**. The engine derived the level from the tree — but it knew the components by
name, kept the port-compatibility table in JavaScript, held the disk minimums in a
constant, decided hardware/fake/software from hard-coded ids, and matched level shapes
with a hand-written function. Meanwhile `data/components/*.yaml` and
`data/raid-levels/*.yaml` described exactly those facts and **were read by nobody**.

The practical cost was visible. Making NVMe work with hardware RAID
(`tech-debt/nvme-hardware-raid-unbuildable.md`) meant editing the engine, because the
engine was the place where "which component is a RAID engine" was written down.

There is a second reason, further out. The shape of this engine — *compose → recognize →
validate → explain* — has nothing specifically RAID about it. If it is ever to serve a
second domain, every RAID fact left in the code is a piece that would have to be torn
out first.

## Decision

**The engine's core contains no domain facts. It reads them from the data files.**

As Valentina put it: *"se il sistema deve essere agnostico, non ci devono essere stringhe
hard-coded: tutto deve venire derivato."* Made precise: the string `RAID 5` still exists —
it lives in `data/raid-levels/raid5.yaml`, and the code derives it from the composed
shape by reading that file.

Four rules follow:

1. **No component is named in the engine's code.** Not `backplane`, not `engine-roc`,
   not `os-linux`.
2. **No RAID level is named in the engine's code.** Not `RAID 5`, not `RAID 10`.
3. **Every object declares itself** in its own file: its ports, what it provides, the
   verdict it carries, its shape, its minimums, its explanatory text.
4. **The engine knows how, the data says what.** Traversing a graph, matching a shape,
   comparing what is provided against what is required — those are the engine's job.
   Which objects exist and what they mean is not.

What legitimately stays in the code:

- **The vocabulary keys the computations operate on** — `striping`, `mirroring`,
  `parity` and the like. These are not facts *about* RAID objects; they are the concepts
  the engine actually computes with. A shape matcher has to know what "mirroring" means
  in order to match it.
- **Templates for the core's own generic messages** — `"Connect the {label} output"`.
  The sentence belongs to the engine; the label comes from the data.

**The acceptance test**: adding a new capability must be a new file and zero lines of
engine change.

## Rationale

- **Against "the engine knows its components"**: it is the same flaw as the abolished
  quiz, one level down. A sandbox whose engine has the answers written inside it is not
  deriving anything; it is recognizing what it was told in advance.
- **Because the promise was already written**: §5 had said this since the beginning. The
  code had simply drifted from it. This ADR does not invent a direction — it makes an
  existing one binding.
- **Because it is falsifiable**: "the engine is agnostic" is not a matter of taste. Grep
  a component id inside `src/engine/`; either it is there or it is not. A principle that
  can be checked is a principle that survives.
- **Because the cheapest extension is the honest one**: if adding a tri-mode controller
  costs one file, the model is genuinely open. If it costs an engine change, the file
  format was decoration.

## Consequences

### Pros

- Adding a component, a level or a verdict is a data change. Proven the day it landed:
  `engine-roc-trimode.yaml` added NVMe hardware RAID as one file, no engine change.
- The data files stop being documentation of the code and become its **source**. There is
  one authority per fact instead of two that can disagree.
- Extraction into a standalone engine becomes possible rather than aspirational: what
  would be left behind is `data/`, not a codebase to be disentangled.
- The teaching content and the behaviour share one source, which is what lets the
  informative UI (`specs/planned/informative-ui.md`) reuse text the engine already reads.

### Cons

- **Indirection costs readability.** To learn what the RoC does you now open a YAML file,
  not a function. Worth it, but real.
- **Wrong data fails at runtime, not at edit time.** The catalogue validates on assembly
  and refuses to build rather than degrading silently, which is the mitigation, not a
  cure.
- **The headless tests need a JS mirror of the YAML** (`tests/fixtures/`), because the
  test suites must stay dependency-free and Node has no YAML parser. Two sources that can
  drift — held together by data tests that read the real YAML with python and fail when
  they disagree.
- **Known exceptions still in code**, recorded rather than hidden:
  - `validator.js` names `'os-linux'`, `'backplane'` and `'NVMe'` in three rules — the
    data-driven rule registry is on the roadmap (technical queue, item 5).
  - `layout.js` keeps the placement algorithms in code. Deliberate: how parity rotates
    is a *computation*, not a fact about an object, and the golden-table discipline binds
    it to the Linux `md` source. §5b's parametric algorithm registry stays deferred.

## See also

- [`specs/implemented/agnostic-engine.md`](../../specs/implemented/agnostic-engine.md) —
  how this decision was implemented, in five steps.
- [ADR-001](001-engine-identity-not-position.md) — the engine object declares its own
  verdict, which is this decision applied to axis A.
- Domain-model spec §5 and §5d — the promise this ADR makes binding.
