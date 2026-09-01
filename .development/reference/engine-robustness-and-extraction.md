# The composition engine — robustness audit and extraction map

**Date**: 2026-09-01
**Scope**: `src/engine/` (`model.js`, `layout.js`, `validator.js`, `graph.js`), the
headless half of `src/sandbox/canvas-state.js`, `src/challenge/challenge.js`, the
port model in `src/sandbox/physical-controller.js`, and the eleven headless suites.
**Question asked**: is the two-axis engine under the RAID game robust, could it be
improved, and is it worth extracting into a project of its own — possibly a small
framework for other "build it and see what you built" simulations? Does anything
like it already exist?

Short answer: the engine is sound and unusually well-tested for its size; its
shape is domain-agnostic and nothing found on the web packages that shape as a
library. It is not yet *separable*: the physical-layer brain lives in the wrong
layer, the domain facts are string literals in code rather than data, and there
is no document format. Those three are the extraction work, and they are worth
doing inside this repo *before* any split — each also closes an open tech-debt.
Whether the result is a "framework" is a question a second domain answers, not
this document.

---

## 1. What the engine is, abstractly

Strip the RAID vocabulary and four parts remain, plus a bridge:

| part | in this repo | what it is generically |
|---|---|---|
| **Composition graph** (axis A) | `cpNodes`/`cpEdges` in `canvas-state.js`; `graph.js`; `COMPONENTS`/`COMPATIBLE` in `physical-controller.js` | a directed graph of component instances with **typed ports**; a compatibility relation on port types; reachability queries |
| **Composition tree** (axis B) | `Model.disk`/`Model.array`, `compile()`, `_reconcile()` | a recursive tree whose inner nodes carry a small **attribute vocabulary** (`segmentation × redundancy`); leaves are atoms |
| **Derivation** | `capacityGB`, `failuresToKill`, `performance`, `computePlacement` | **folds** over the tree (one recursive function per property) and **path claims** over the graph (`_recognizePhysicalLayer`) |
| **Recognition** | `Model.recognize`, the hardware/fake/software verdict | a **shape grammar**: name the structure from its form, never from a selection; "valid but unnamed" is a first-class result |
| **Rules** | `validator.js` `RULES` | a declarative registry of hard/soft checks, each tagged with the layer it reasons about, producing node-attributed violations |
| **Requirements** | `challenge.js` | `{metric: {op, value}}` evaluated against the derived properties; any composition that satisfies them wins |
| **Bridge** | "the disk is the shared atom" (spec §2) | one atom present in both structures, so the graph verdict and the tree name are claims about the same build |

The founding principle — *derive, don't select* — is the property of the whole
pipeline, not of RAID: `compile → derive → recognize → place → validate → check`.
That pipeline is `evaluate()` (`canvas-state.js:382`).

## 2. Robustness audit

### 2.1 What holds, and why it matters for extraction

- **Headless by construction.** Every engine file exports through
  `module.exports` under Node and `root.<Name>` in the browser, and the DOM never
  appears in `src/engine/`. The `index.html` load order confirms nothing in the
  engine depends on `sandbox/`. This is the single property that makes extraction
  cheap: the seam already exists at the file boundary.
- **Tests are the gate, and they are green.** Eleven suites, 265 assertions, all
  passing on 2026-09-01; CI (`.github/workflows/tests.yml`) runs them one at a time
  via `.development/automation/test.sh`. Coverage is where it should be:
  recognizer (23), performance (29), golden layouts (30), validator (33), graph
  (23), state + pipeline (49), fuzz (6, over 6000 random gestures), challenges (33),
  data files (46).
- **Ground truth is external.** Golden tables are hand-derived from `md/raid5.c`
  and `raid10.c`, never dumped from the engine (`principles.md`). A framework
  whose first instance is cross-checked against a kernel is a framework whose
  derivations can be *trusted*, which is the whole proposition.
- **Declared fallbacks.** `layout.js` reports an unknown algorithm as `fallback`
  instead of guessing silently; `computePlacement` returns `{unsupported, reason}`
  rather than inventing a grid. The dormant `backplane-diversity` rule says it is
  dormant. This discipline ("faithfulness over coverage") is a *policy* a
  framework can enforce structurally.
- **Recognition ≠ validation ≠ structural completeness.** Three orthogonal jobs
  over one tree (`validator.js` header, `_firstIssue`). Most rule engines collapse
  these; keeping them apart is what lets the UI never say the same thing twice.
- **State is reconciled, not trusted.** `_reconcile()` (`canvas-state.js:350`)
  rederives roots and membership from the node map on every evaluation, claiming
  each member for the first array that holds it. This is why the fuzz test can
  exist. In an extracted core it is the invariant the document format rests on.
- **The registry pattern is already generic.** `validate()`
  (`validator.js:266-305`) — layer filtering, `(code, nodeId)` dedup, severity
  split — contains no RAID. Only `RULES` does. Same for `checkChallenge()`: the
  only domain coupling is `METRIC_LABEL`.

### 2.2 Findings, ranked by what they cost an extraction

**F1 — The axis-A brain is in the wrong layer.** `_recognizePhysicalLayer`
(`canvas-state.js:495-657`, 160 lines) and `_buildPhysicalAdapter` (`:456`) are
pure functions over the graph, but they live in `src/sandbox/`, the layer the
architecture map says "owns the DOM". `graph.js` was carved out of them in
Stage E; the recognizer stayed behind. Extraction moves them to `engine/`; nothing
else changes, and the move is mechanical.

**F2 — The verdict hard-codes component identities.** The recognizer branches on
the string literals `'engine-roc'`, `'engine-metadata'`, `'hba'`, `'cpu'`,
`'os-linux'`, `'os-windows'` (`:499, :511-512, :556, :621, :635`), and the
adapter counts engines by the same two ids (`:457-458`). The component YAMLs
declare `provides: [raid-engine, protocol-translation, …]` — and no code reads
it (`physical-model-fidelity.md` §3). Spec §5 promised "adding capability =
adding a file"; for axis A that promise is unmet: the open **tri-mode engine**
design (handoff 2026-07-31, "Opzione C") would today be *another branch in the
recognizer*, not another file. Generic form: verdict rules keyed on
**capabilities** (`raid-engine`, `protocol-translation`, `os`) read from the
component catalogue, with identity used only where the domain says identity is
the discriminant (ADR-001).

**F3 — Port typing lives in the UI, so the engine cannot refuse a connection.**
`COMPONENTS` and `COMPATIBLE` are in `physical-controller.js:36-80`, browser-side;
`cpConnect` (`canvas-state.js:252`) accepts anything. Consequences already
filed: `ports-double-source-of-truth.md` (JS table + YAML `ui.ports`, byte-identical
today, silently divergent tomorrow) and `headless-tests-bypass-port-validation.md`
(17 `raidType` assertions built with 35 `cpConnect` calls, some on canvases no
player can draw). Also `pcie-raid`, a port type nothing declares, and a
compatibility check that is *symmetric* (`portsCompatible` accepts a pair if
either direction lists the other), which is looser than the out→in model
`graph.js` documents. In a framework the port model is core, not UI; moving it
to `engine/ports.js`, fed by the YAML, is the fix for both tech-debts and settles
the open Option A/B decision on the test bypass in favour of A (validate in
`cpConnect`).

**F4 — The recognizer and the minimums are hand-coded twice.** `recognize()`
(`model.js:108-170`) is a decision procedure; `MIN_DISKS` (`validator.js:75-84`)
a table. `data/raid-levels/*.yaml` carry `shape:` and `minDisks` for the same
facts, deliberately unread (they wait for a visual channel — see the project
memory). For the RAID game that duplication is a maintenance cost held in check
by `raid-levels-data.test.js`. For a framework it is the central question: is the
naming table **data** (a shape grammar the core matches) or **code** (a function
the domain supplies)? The nested cases (`childToken`: `r10` vs `mirror`,
`uniformToken`) show the grammar needs one construct beyond flat shapes — "all
members match shape S" — which is small. Recommendation: data, with a code escape
hatch; the YAML is already 80% of the way there.

**F5 — `evaluate()` mutates, and routes by first match.** `cpAutoRoute(state)` runs
inside `evaluate()` (`:420`) — the comment explains why (a render used to be the
only caller), but an evaluator with a side effect cannot be memoised, replayed, or
run twice on the same state safely. And the auto-router picks the target with
`.find()` (`:288-289`) — exactly the "coin toss with two backplanes" `graph.js`
warns about at `:120-124`, and the case the 2026-07-31 session hit in-browser.
Fix: routing is a mutation the controller calls before evaluation; evaluation is
pure. The two-backplane ambiguity then becomes an honest `issue`, not a guess.

**F6 — There is no document.** No serialize/deserialize of a build exists
anywhere; ids come from a module-level counter (`canvas-state.js:42-43`) shared by
every state in the process and reset on reload. `overview.md` names "the
shareable URL" as the goal of the whole stack choice; it is unmet because a build
cannot be written down. For a framework this is requirement zero: a core whose
state cannot leave the process is not a library. The format is small — the two
maps plus the attribute fields — and `_reconcile` already defines what a
well-formed document is.

**F7 — No type surface.** `@ts-check` appears in no file. Inside one repo that
is a choice; at a library boundary the JSDoc types *are* the contract
(`Node`, `Violation`, `Placement`, `PhysicalView`). The sanctioned upgrade path
(`overview.md`) becomes mandatory at the seam.

**Minor, recorded for completeness.** `placeLinear` ignores `rows`;
`copies` is read (`copiesOf`) but no mutation sets it (reserved, spec §3a); the
validator computes `ctx.level` (`:272`) that no rule reads yet (declared, for
phase 2b); mirror-over-arrays (RAID 51/61/0+1) has no grid by design. None of
these affect the extraction.

### 2.3 Verdict on robustness

Robust in the sense that matters — *what it says is true, and a test would catch
it becoming false* — and fragile only at the seams an extraction would have to
cut anyway. F1–F3 are one coherent refactor ("the physical layer's model lives in
the engine and is data-driven"); F4 is the design decision of the framework; F5–F7
are what turns an engine into a library. Nothing here is a rewrite.

## 3. Landscape: does this exist?

Survey run 2026-09-01 (web). Summary; the search covered node editors, educational
simulators, systems-modeling tools, rule engines, and "derivation over
composition" in any language.

**Typed-port canvas editors — commodity.** Rete.js (`isCompatibleWith` sockets,
headless core), Baklava.js (`NodeInterfaceType`), LiteGraph (slot types + a
per-node dataflow executor), Blockly (connection checkers), JointJS/GoJS
(`validateConnection` / `linkValidation`), React Flow (`isValidConnection`,
untyped handles). Every one stops at "may these two ports connect". **None derives
a verdict from the graph.**

**Educational build-and-see sandboxes — engines are not reusable.** Falstad
CircuitJS, Logisim-evolution, CircuitVerse, hneemann/Digital: solver and UI are one
codebase. The exception is **Willow DLS** (MIT, TypeScript), a headless digital-logic
engine explicitly meant as "engine for someone else's GUI" — domain-fixed, no port
matrix, no recognizer, no rule registry. Puzzle games (NandGame, Turing Complete,
Zachtronics) check behaviour ("output table matches"), not requirements over
derived properties.

**Systems modeling and rules — the parts exist, heavy or flat.**
`json-rules-engine` is parts 3+4 almost verbatim (`{fact, operator, value}`
conditions) but flat: no layers, no node attribution, no graph awareness. Eclipse
Capella has typed component ports, delegation rules and categorised validation
with element-attributed diagnostics — the closest conceptual match to parts 1+3 —
as a Java/EMF desktop tool with no "what did I build". MontiArc and Ptolemy II
compose typed-port components hierarchically; their derivation is behavioural
(simulate), never structural (name). SysML v2 formalises "requirement satisfied
by design" (part 4). For shape matching in JS: `ts-pattern` (no recursion
primitives), `tree-term-rewriting`, `graphgram`; attribute-grammar style recursive
derived properties have no mainstream JS library.

**Derivation over composition — the nearest relatives are game mods.**
Minecraft/Minetest *multiblock* libraries (declarative patterns; the engine
recognises "you built machine X") are a genuine recognizer-over-composition, but
positional, with no types, metrics or rules. Kerbal Engineer derives Δv/TWR from
the assembled part tree (recursive folds), tied to the game. **No project
self-describes as a generic compose → recognise → validate → explain framework.**

**RAID specifically.** raidTool, RAID Visualizer (Peckham), RAID-Simulator, plus
plain calculators — all *select* the level. None models the physical control
path or checks layouts against kernel-derived tables.

**Bottom line.** Commodity: the canvas, pairwise port compatibility, flat rules.
Uncommon: the recognizer (name from shape), reachability verdicts over a typed
physical graph, recursive derived properties feeding requirement-based wins, and
all of it headless and cross-checked against external truth. Those four are the
engine's identity and they have no packaged precedent found.

## 4. Framework, library, or method?

Three honest observations before the recommendation.

1. **The generic code is small.** Already domain-free: `graph.js` (140 lines), the
   `validate()` skeleton (~50), `checkChallenge`/`validateChallenge` minus the
   label table (~90), `_reconcile` + `compile` (~60). Missing and needed:
   `ports.js`, a shape matcher, a document format, a pipeline definition. The core
   would be perhaps 500–700 lines. That is a library, not a platform.
2. **The method is the larger asset.** *Derive, don't select* · *recognition is
   not validation* · *a fallback that is not reported is a lie* · *golden tables
   come from the ground truth, never from the engine* · *one atom shared by two
   structures* · *layer-tagged rules* · *any composition that satisfies the
   requirements wins*. These are the reason the RAID game is trustworthy, and none
   of them is in a line of code. A framework that does not carry them as
   documentation carries nothing.
3. **One instance is not enough to know the seams.** A core abstracted from a
   single domain is a guess; the second domain is what tells you which parameters
   were RAID all along (is "two orthogonal attributes per node" general, or is it
   striping and redundancy wearing a costume?). The rule of three exists for this.

**Recommendation.** Do not extract "the framework" from this repo in the
abstract. Do the seam work here (§5, phases 0–2, each closing a filed tech-debt),
then split the engine out *with its history* and build the second domain against
it *at the same time*, letting that domain pull the seams to where they belong.
Call it a kit — core + method document + one reference domain — and let "framework"
be a word it earns at the third instance. The RAID game then consumes the kit
exactly as it consumes `vendor/js-yaml/` today: a vendored, versioned copy, no
package manager, zero runtime dependencies preserved.

## 5. Seam map

What in each file is core and what is RAID. "Move" means it belongs in the core
as-is; "split" means the file has both.

| file | core (domain-free) | RAID (domain plugin) |
|---|---|---|
| `engine/graph.js` | all of it — rename `RaidGraph` only | — |
| `engine/model.js` | `disk`/`array` constructors → generic `atom`/`node` with a declared attribute vocabulary; `countDisks`-style leaf count; `sum`/`sumSmallest` | `SEGMENTATIONS`/`REDUNDANCIES`, `recognize`, `childToken`, every fold (`capacityGB`, `failuresToKill`, `performance`), `analyze`'s key list |
| `engine/layout.js` | the **composition** rule in `placeNested` (compose child grids side by side, renumber in write order), `unsupported`/`fallback` protocol, the algorithm-resolution pattern | every primitive (`placeStripe`, `placeMirror`, `placeParity`, `RAID10_LAYOUTS`) and the golden tables |
| `engine/validator.js` | `validate()`, `walkArrays`-style labelled walk, `Violation` shape, layer tags, dedup | `RULES` and each `check*` |
| `sandbox/canvas-state.js` | state factory, both mutation families, `_reconcile`, `compile`, `evaluate` as a *pipeline definition*; `_recognizePhysicalLayer` **as the path-claim helpers** (`pathIssueFor`, `onPath`, `fedBy`/`reaches` gates) | the verdict rules (which capability ⇒ which verdict), the messages, `_diskTargetComponent`, `_buildPhysicalAdapter`'s engine count |
| `sandbox/physical-controller.js` | `COMPATIBLE` + `portsCompatible` → `engine/ports.js` | `COMPONENTS` → the component catalogue (already in `data/components/`) |
| `challenge/challenge.js` | `meets`, `checkChallenge`, `validateChallenge` | `METRIC_LABEL` (the metric vocabulary is the domain's `analyze` keys) |
| `data/*.yaml` | the *schemas* (component: ports + capabilities; level: shape + minimums; algorithm: descriptor; challenge: requirements) | every file |
| `tests/` | `test-helpers.js`, the fuzz harness pattern, the "data file validates against schema" pattern | every fixture and golden table |

Target shape of the extracted project (working names, all provisional):

```text
<kit>/
  core/
    tree.js          composition tree: atoms, nodes, attribute vocabulary, reconcile, compile
    graph.js         as today
    ports.js         port types, compatibility relation, connect validation   (NEW)
    recognize.js     shape-grammar matcher over declarative shapes            (NEW)
    derive.js        fold registry: property name → recursive function        (NEW, thin)
    rules.js         registry + validate() skeleton
    requirements.js  metric/op checker + static validation
    document.js      serialize / deserialize / ids                            (NEW)
    pipeline.js      compile → derive → recognize → place → validate → check
  domains/raid/      vocabulary, folds, shapes, placement primitives, rules, catalogue, messages
  docs/METHOD.md     the seven principles, with the RAID game as the worked example
  tests/             core suites + the RAID golden suites, unchanged
```

## 6. Extraction path

Ordered so each step leaves this repo shippable and every suite green.

- **Phase 0 — put the physical model in the engine (F1, F3, F5).** Move
  `_recognizePhysicalLayer` + adapter to `engine/physical.js`; move ports and
  compatibility to `engine/ports.js`, loaded from `data/components/*.yaml` with
  the JS table as fallback (same pattern `loadComponentDefs` uses today); make
  `cpConnect` validate through it (closes `headless-tests-bypass-port-validation`
  and `ports-double-source-of-truth`; the tests that wired impossible canvases
  fail loudly and get rewritten — that is Option A with the audit for free);
  take `cpAutoRoute` out of `evaluate()`. Branch: `refactor/physical-model-in-engine`.
- **Phase 1 — make the domain facts data (F2, F4).** Verdict rules keyed on
  capabilities from the catalogue; `recognize()` driven by `raid-levels/*.yaml`
  `shape:` blocks (plus the "uniform members of shape S" construct) with the
  current function kept as the oracle in a cross-check test until the two agree
  on every fixture; `MIN_DISKS` from `minDisks`. The waiting data files get their
  channel. **Do the tri-mode engine here, as the first "add a file" component** —
  it is the natural acceptance test, and it is already the top item of the
  backlog.
- **Phase 2 — a document (F6, F7).** `serialize(state)` / `deserialize(json)`;
  ids from the document, not a global counter; `@ts-check` + JSDoc types on
  every engine file. The shareable URL is then a ~20-line feature.
- **Phase 3 — split with history.** `git subtree split` on `src/engine/` +
  `tests/` (the 2026-07-24 extraction of this repo from the personal site is the
  precedent; it kept 89 commits). The RAID domain goes as the first plugin; this
  repo vendors the kit back (`vendor/<kit>/`, like js-yaml) and its UI is
  untouched.
- **Phase 4 — the second domain, against the kit.** This is where the core's
  actual boundary is discovered; expect `tree.js` and `recognize.js` to change
  shape once. Ground truth first, golden tables by hand, as here.

Phases 0–2 are worth doing even if the extraction never happens: they close
four filed tech-debts, unblock tri-mode cleanly, and deliver the shareable URL.

## 7. Candidate second domains

The useful second domain stresses a *different* seam than RAID does, and has a
ground truth as unarguable as the kernel source.

| domain | stresses | ground truth | note |
|---|---|---|---|
| **Series/parallel circuits** (resistors, sources; recognizer: divider, bridge, ladder) | the tree: two combinators, folds for resistance/current/power | Kirchhoff — math, checkable by hand | purest axis-B analogue; fast; teaches whether "two orthogonal attributes" is general |
| **Network topology** (hosts, switches, routers, firewalls, VLANs; verdicts: reachability, broadcast domains, "who can see whom") | the graph: typed ports, capability-based verdicts, path diagnostics | RFC-level rules, `iptables`/routing semantics | purest axis-A analogue; the diagnostics style (`pathIssueFor`) transfers directly |
| **ZFS pools** (vdevs: mirror, raidz1/2/3, stripe over vdevs, special/log/cache) | the shape grammar and placement without near/far | OpenZFS source | too close to RAID to be a good *second*; excellent *third* |
| **Service availability** (LB, replicas, primary/replica DB, zones) | both axes, availability as a fold | harder — models, not source | tempting, but the truth is arguable; not first |

Recommendation: **circuits second, networks third**, or the reverse; ZFS after.
Either first choice can be golden-tested by hand in an afternoon, which is the
property that made the RAID engine trustworthy.

## 8. Decisions this document stops at

These are Valentina's, and the extraction should not start before them:

1. **Which second domain** — it determines which seam gets pulled first (§7).
2. **Data-driven before or after the split** — phase 1 in this repo (recommended:
   the tri-mode component then arrives as a file and validates the design), or in
   the kit with the RAID domain as its first migration.
3. **Name and scope** — library ("kit": core + method + one reference domain) vs
   framework ambition; and whether the canvas UI is in scope at all or stays
   per-project (the touch shim and the tap-to-picker inversion are UI, and they
   are good; the survey's commodity editors are an alternative, not a need).

Related: `physical-model-fidelity.md` (what is true on axis A), ADR-001 (why
identity, not position), spec §2/§5 (the two axes and the resource-family
promise), `tech-debt/` (the four issues phases 0–2 close), memory-bank idea
`2026-09-01-extract-composition-engine.md`.
