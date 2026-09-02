# RAID Sandbox — Domain Model (design backbone)

**Status:** COMPLETE — phases 0–5 implemented · Stage A/E merged · Phase 5 (B/C/D) on `feature/raid-phase5-game` (2026-06-07)
**Date:** 2026-06-01 (replanned 2026-06-02)
**Branch (current):** `feature/raid-shared-disks-nested` · prior: `feature/raid-sandbox-domain-model` (merged)
**Source notes:** `.personal/*.md` + `.personal/IMG20260601163917.jpg` (RIEPILOGO diagram)

> This is the *blueprint*: the model from which both the YAML resource files and the
> engine derive. It is meant to be marked up, not obeyed. Where a decision is the
> author's to make, it is tagged **[DECISION]**.

---

## 1. What the game becomes

Today the project is two disconnected halves: a **Visualize** gallery that explains
RAID statically, and a **Build** quiz whose answers are literally "RAID 0 / 1 / 5 / 6 / 10".
The quiz is linear because the RAID level is *picked from a list*.

The target is a single **sandbox builder**: the player drags physical components onto a
canvas, composes data-organization primitives, and the engine **derives** what they built,
**validates** it, and **shows** how data lands on the disks.

Two modes, same engine:

- **Prompt mode** — a "client" states requirements ("I need a volume that survives 2 disk
  failures, optimized for sequential reads"); the player builds a topology that satisfies them.
- **Sandbox mode** — free exploration under mandatory constraints only; the player asks
  *"what if?"* and the canvas answers visually.

The sandbox is, in effect, an **answer engine** for topology questions:

- *Can I make a span over 3 drives of a 4-drive drive group?*
- *If I extend two RAID-5 drive groups, how does data distribute under Right Asymmetric?*
- *If I build a RAID with mirroring, what RAID am I actually creating?*

### The founding principle

> **The RAID level is not selected. It is derived from what you compose.**

You assemble primitives (striping, mirroring, parity, spans); the engine pattern-matches the
resulting tree and tells you the level + *why*. This is the antidote to the linear quiz and
the thing that turns "guide + quiz" into a game.

---

## 2. The two axes

The domain splits into two **independent** axes. Keeping them separate is what makes the
resource-file approach hold.

| Axis | What it is | What it determines | Notes source |
|------|-----------|--------------------|--------------|
| **A. Control path** | disks → backplane → HBA → RAID engine → PCIe → CPU → OS | hardware / software / fake RAID + which OS | `hardware/software/fake-raid.md`, `protocolli-dischi.md`, RIEPILOGO image |
| **B. Data layout** | striping, mirror, parity, placement algorithm, nesting | the RAID *level* + the **animation** | `distribuzione-segmenti-algoritmi.md`, `segment-allocation-rule-left-symmetric.md`, `nested-raids.md` |

They are orthogonal *at the level granularity*: *RAID 6 left-symmetric* can run on hardware **or**
software. A build is **a control path (axis A) carrying a data layout (axis B).** But the axes
**interact on the algorithm menu**: the control path *gates which layout algorithms are available*
(see §6) — e.g. RAID 10 `near/far/offset` exist only under Linux software RAID (mdadm).

A **third axis — runtime behavior** (drive states, hot-spare rebuild, failure simulation;
`drive-states.md`) — is explicitly **out of scope** for v1, designed as a separate future module.

### Axis A — the key insight from the RIEPILOGO diagram

Hardware / software / fake RAID are **not three different things**. They are the *same physical
path* with the **RAID engine ("motore RAID") placed at a different point**:

```
Disks (SATA/SAS/NVMe) → Backplane → HBA → [PCIe bus] → CPU → OS
                                       ▲        ▲          ▲
                              hardware │   fake │    software│
                              (RoC on  │  (chip │   (mdadm/  │
                               PCIe    │   near │    ZFS /   │
                               card    │   CPU, │  StorageSp)│
                               incl.   │  Intel │            │
                               HBA)    │   RST) │            │
```

- **Hardware** — RoC on a dedicated PCIe controller that *includes* the HBA; OS sees one Virtual Drive. (MegaRAID/Broadcom)
- **Fake** — HBA passes raw protocol; RoC is a dedicated chip on/near the CPU. (Intel RST)
- **Software** — no RoC hardware; the OS computes it (Linux `mdadm`/ZFS, Windows Storage Spaces); needs a UPS for power-loss protection.
- **NVMe** — special case: bypasses backplane + controller, talks straight on PCIe.

**Game consequence:** the player does not label the RAID type — they *place the engine on the
path*, and the placement **is** the type.

### The two views, and how they bridge — **the disk is the shared atom** (Option 2)

The two axes are orthogonal *in the model*, but the player sees them as **two views of one build**,
and the views must visibly be about the *same* disks. The bridge:

> **[DECISION — CONFIRMED 2026-06-02]** A disk is **one entity with one identity**, created once
> and present in **both** views — never dragged twice. In the **data view** you group it into the
> array tree; in the **physical view** it sits at the base of the control path. The conceptual
> weld is the **RAID engine**: the layout you compose in the data view is *what the engine
> computes*, and *where* the engine sits on the physical path *is* the type (hw/sw/fake).

**v1 simplification — no manual disk-wiring.** The only per-disk physical wiring the constraints
(§6) would demand is: *NVMe bypasses the backplane* (hard, but determined by the disk's
**protocol**, already chosen at creation → the disk auto-routes: SATA/SAS → backplane, NVMe → PCIe)
and *span across different backplanes* (soft, **deferred** — §9.4). So in v1 the disk appears in
both views from a single drag and routes itself; the physical view's interaction stays on what
teaches — **engine placement and OS choice**. Manual disk-routing arrives only with the deferred
backplane-diversity module.

> Rejected alternatives: a single "drive group" plug node (can't express per-disk constraints like
> NVMe-bypass) and a fully merged single canvas (largest UX rework, breaks the additive property).
> Option 2 expresses the per-disk constraints *and* stays additive.

---

## 3. The data model — one recursive tree

The single most important decision. An **array** does not contain disks; it contains **members**,
and a member is **either a disk or another array**. Recursion gives nested RAID (10, 50, 60, 6+0)
*for free* — build the brick once, compose forever.

An array's "layout" is **two orthogonal choices**, not one (this drives the step-by-step prompt
gameplay: *step 1 — how do you segment? step 2 — how do you protect?*):

```
Node =
  | Disk  { id, sizeGB, protocol: SATA|SAS|NVMe, backplaneId }
  | Array { segmentation, redundancy, members: Node[], algorithm?, copies? }

segmentation ∈ { striped, linear }                  ← how data is split across members
redundancy   ∈ { none, mirror, parity1, parity2 }   ← how data is protected
copies       ∈ { 2 }   (mirror only, default 2)     ← replication factor for flat RAID 10 (§3a)
```

**The two axes are independent, and drive different derived properties:**

| Choice | Drives |
|--------|--------|
| **segmentation** | the *name* (`striped+none` = RAID 0 vs `linear+none` = JBOD) and the placement **animation** |
| **redundancy** (+ `copies`) | **capacity** and **fault tolerance**. One exception: `mirror` reads segmentation — `striped+mirror` = flat **RAID 10** (copies 2), distinct from `linear+mirror` = RAID 1. See §3a. |

- `Array.members` may be `Disk`s (a leaf array, e.g. a single RAID-5 span) or other `Array`s
  (a nesting array, e.g. the RAID-0 stripe over two RAID-5 spans → RAID 50).
- `algorithm` (axis B placement rule) attaches to the array whose layout needs one
  (parity arrays → left/right symmetric/asymmetric; mirror arrays → near/far/offset).
- *"Concat"/JBOD is not a separate primitive* — it is `segmentation: linear, redundancy: none`
  (the "disk spanning" of `terminologia.md`).

### Worked example — RAID 50 (from `nested-raids.md`)

```
Array { striped, none }                                ← top: RAID 0 across spans
 ├─ Array { striped, parity1, algo: right-asymmetric, members: [D1,D2,D3,D4] }   ← span A (RAID 5)
 └─ Array { striped, parity1, algo: right-asymmetric, members: [D5,D6,D7,D8] }   ← span B (RAID 5)
```

Same shape with `parity1`→`parity2` is RAID 60. A stripe over `linear+mirror` spans is **RAID 1+0**
(the manual nesting) — still recognized as RAID 10, but the *canonical* flat RAID 10 is a single
array (§3a), which is the form that carries the near/far/offset layout.

### 3a. RAID 10 is flat, not nested — **[DECISION — CONFIRMED 2026-06-02]**

mdadm treats RAID 10 as its **own level**, not RAID 1 nested in RAID 0 — precisely so it can offer
the **near / far / offset** layouts, which spread the 2 copies across *all* disks in ways that do
**not** decompose into fixed mirror pairs (far/offset put a chunk's two copies on disks that are not
a "pair"). So in our model RAID 10 is a **single** array:

```
Array { striped, mirror, copies: 2, algorithm: near|far|offset, members: [D0..D(n-1)] }
```

- **copies** = replication factor, fixed at **2** for v1 (field reserved for a future 3-way).
- **capacity** = `sum(diskCaps) / copies` (≈ n/2 disks), **not** `min`. This is the one place the
  *segmentation* axis changes capacity: `striped+mirror` (RAID 10) ≠ `linear+mirror` (RAID 1).
- **fault tolerance** = `copies − 1` = 1 guaranteed.
- **layout** = near (default) / far / offset — the **mirror-class** placement algorithm (§5b).
- requires an **even** disk count; odd → RAID 1E (niche, non-standard).

**RAID 50/60 stay nested** (a stripe over parity spans has no flat equivalent) — exactly mdadm's
md-over-md. So the recursive tree and the nesting gesture (Stage A1/A2) remain essential; only
RAID 10 collapses to a single flat node.

**Flat RAID 10 vs nested RAID 1+0 — two real things, two names.** The classic stripe-over-mirror-pairs
build (`striped+none` over `linear+mirror` spans) is the textbook **RAID 1+0** and is recognized under
that *distinct* name. Its placement is **composed** (parent stripe over each span's mirror grid →
reproduces `near`). The flat `striped+mirror` single array is **RAID 10** (mdadm's level), the only
form that carries far/offset. Naming them apart is deliberate: most docs conflate the two, and that
conflation is exactly what trips learners up — the game should not.

---

## 4. Deriving the RAID level (axis B → name)

The engine recognizes the level by **pattern-matching the tree shape**. A small, ordered
recognizer (first match wins):

| Tree shape (segmentation + redundancy) | Derived level |
|-----------|---------------|
| `linear + none`, members = disks | **JBOD / spanned** (not RAID) |
| `striped + none`, members = disks | **RAID 0** |
| `linear + mirror`, members = disks | **RAID 1** (n-way if >2 disks) |
| `striped + parity1`, members = disks | **RAID 5** |
| `striped + parity2`, members = disks | **RAID 6** |
| `striped + mirror`, members = disks, **even** count | **RAID 10** (flat, copies 2 — §3a) |
| `striped + none` over `mirror` spans | **RAID 1+0** (nested — a *distinct* name from flat RAID 10) |
| `striped + none` over `parity1` spans | **RAID 50** |
| `striped + none` over `parity2` spans | **RAID 60** |
| `striped + mirror`, members = disks, **odd** count | **RAID 1E** (niche, non-standard) |
| anything else | **custom / unrecognized** (sandbox still shows the data layout) |

> **[DECISION — CONFIRMED]** A valid composition with no standard name is **allowed and
> animated** in sandbox: *anything without a violated constraint can be built.* The recognizer
> emits an explicit status flag so the UI can react:
>
> ```
> recognized:   { level: "RAID 50", confidence: exact }
> unrecognized: { level: null, flag: "non-standard-config",
>                 message: "Valid build with no canonical RAID name — here's how data lands." }
> ```
>
> The `unrecognized` flag is a **first-class result, not an error**: validation (constraints)
> and recognition (naming) are separate steps. A build can be fully valid *and* unnamed.

---

## 4b. Deriving performance (axis B → throughput, *measurable*)

> **[DECISION — CONFIRMED 2026-06-02]** Performance is a **first-class derived property**,
> alongside capacity and fault-tolerance. It is computed from real, citable formulas — never
> eyeballed — so that prompt-mode requirements like *"optimized for sequential reads"* become
> checkable in the same outcome-based way as `faultTolerance >= 2` (the golden-table principle
> applied to performance).

Like capacity and fault-tolerance, performance **derives from the two axes**:

| Quantity | Comes from | Values |
|----------|-----------|--------|
| **Write penalty** `W` | `redundancy` | none=1 · mirror=2 · parity1=4 · parity2=6 |
| **Parallelism** `N` | `segmentation` | striped → many disks in parallel · linear → 1 at a time |

`W` is the number of physical I/O ops per logical write: mirror writes each copy (2); parity1 does
read-modify-write — read old data + old parity, write new data + new parity (4); parity2 adds the
second parity Q (6). These values are the storage-design canon.

The canonical **functional IOPS** formula:

```
IOPS_array = (N × IOPS_disk) / (read_frac + W × write_frac)
```

and the throughput multipliers vs a single disk: read ≈ N× (striping; mirror also lets reads fan
out across copies), write ≈ N/W×.

- **Composition (nesting):** performance composes over the tree like capacity does — RAID 10 =
  stripe over mirrors → stripe width drives read, `W=2` keeps writes cheap (why it beats RAID 5/6
  for write-heavy DB loads); RAID 50/60 inherit the parity write penalty.
- **Sequential vs random — the one nuance.** `W` dominates *random small* writes; on *large
  sequential full-stripe* writes RAID 5/6 compute parity once per stripe and the penalty nearly
  vanishes. Challenges distinguish "sequential" from generic load, so the model exposes **two
  characterizations** (sequential + random) rather than collapsing to one.

**Engine surface:** `model.analyze()` gains `readClass` / `writeClass` (buckets of the
formula-computed multiplier — the formula is the authoritative source, the bucket is presentation).
Implemented in Stage B, with the high/medium/low thresholds pinned to a citable reference.

---

## 5. The three resource families

Axis structure maps to **three independent kinds of YAML file**. Adding capability = adding a
file in the right family, ideally with **no engine change**.

```
data/
  components/      ← axis A: physical pieces + connectivity + constraints
  algorithms/      ← axis B: data-placement rules + animation descriptor
  raid-levels/     ← topology requirements expressed over the two above
  challenges/      ← prompt-mode scenarios (already exists, extended)
```

### 5a. Component resource — schema (proposal)

A component declares an **interface**: what it *provides* and what it *requires*. The engine
validates the canvas graph by matching provides↔requires. Example (`components/hba.yaml`):

```yaml
id: hba
name: HBA (Host Bus Adapter)
category: connectivity
description: Translates SATA/SAS electrical protocol. Passes commands unchanged.
provides:
  - capability: protocol-translation
    protocols: [SATA, SAS]
requires:
  - capability: pcie-slot          # must connect upward to a PCIe bus
constraints:
  - rule: not-raid-capable         # an HBA alone cannot host the RAID engine
popup: { ...explanatory text, reuses existing popup format... }
```

Sketch of the component set (granularity: **down to the HBA**, per author's intent):

| id | provides | key constraint |
|----|----------|----------------|
| `disk-sata` / `disk-sas` / `disk-nvme` | block-storage | nvme bypasses backplane; sas supports dual-port |
| `backplane` | passive-routing | members of one span *should* span different backplanes (fault tolerance) |
| `hba` | protocol-translation | not RAID-capable |
| `controller-hw` | raid-engine + protocol-translation (includes HBA) | hosts RoC → hardware RAID |
| `cpu-chip-raid` | raid-engine (fake) | Intel RST → fake RAID |
| `os-linux` / `os-windows` | raid-engine (software) | mdadm/ZFS · Storage Spaces; needs UPS |

> **Superseded 2026-07-30**: this early sketch's ids never shipped as written and the
> Hardware/Fake discriminant it implies (RAID-capable component vs. not) is superseded —
> see [ADR-001](../../reference/decisions/001-engine-identity-not-position.md). The
> components that actually shipped are `engine-roc` and `engine-metadata`
> (`data/components/`), told apart by identity, not by which capability they declare.

> **Update 2026-09-02**: the promise of this section is now kept. The engine builds a
> catalogue from these files (`src/engine/catalog.js`), validates every wire against
> the declared ports and the `portTypes` relation in `index.yaml`, routes disks by
> `accepts:`, and derives the hardware/fake/software verdict from each object's own
> `verdict:` block (ADR-001, update of the same date) — no component is named in code.
> Proof: `engine-roc-trimode.yaml` added NVMe hardware RAID as one file.

### 5b. Algorithm resource — schema (proposal)

Carries the placement rule **and** the animation. Example, the default
(`algorithms/left-symmetric.yaml`), straight from `segment-allocation-rule-left-symmetric.md`:

```yaml
id: left-symmetric
name: Left Symmetric
appliesTo: [parity1, parity2]        # which layouts can use it
default: true
description: Parity rotates leftward; data starts right of parity and wraps.
pros: [best sequential-read continuity, balanced parity load]
cons: []
placement:                            # the two-step rule, as data
  parity:
    start: rightmost                  # stripe 0: parity on rightmost disk
    rotate: left                      # shifts left each stripe
  data:
    start: right-of-parity            # first data block right of last parity
    direction: right
    wrap: true                        # wrap-around at right edge
```

> **[DECISION — CONFIRMED]** The engine has a small library of **parametric placement
> primitives** (`stripe`, `mirror-near/far/offset`, `parity-rotate`) that read these descriptors.
> A *variant* algorithm = a new file. A *radically new* placement = a new file + a new primitive.
> ~90% data-driven, not 100% — accepted.
>
> **Algorithm fallback is a hard requirement** (field name: `fallback` — NOT "degraded", which is
> reserved for the runtime disk/array state in `drive-states.md`). The engine must not break when an
> algorithm file references a primitive that does not exist, or when an algorithm is missing:
>
> - Unknown primitive → fall back to the layout's **default** algorithm (e.g. `left-symmetric`
>   for parity) and surface a non-blocking `fallback` notice.
> - Missing/empty descriptor → still build the topology and derive the level; only the
>   *animation* is skipped, never the whole view.
>
> This fallback is an **internal safety net** (resource files may be incomplete) — it is NOT a
> user-facing choice. The UI offers only known algorithms, so a user can never select an unknown one.
>
> **Verification protocol (golden tables).** An algorithm is "correct" iff its placement reproduces
> an **authoritative published table**, not by visual inspection. Only verified algorithms go in the
> engine's known-list and the UI. Each added algorithm ships with a golden reference table (from a
> citable source) baked into the test suite. v1 ships `left-symmetric` only (verified against the
> canonical table + `.personal` notes); RAID 0 / mirror / JBOD are trivially correct by inspection.

**Two distinct "non-standard" concepts — do not conflate:**

- **Non-standard NAME** comes from the *topology* (`segmentation + redundancy + nesting shape`), e.g.
  an odd-count `striped+mirror` (RAID 1E) or stripe-over-stripes. This is the legitimate answer-engine case
  (§4): a valid build with no canonical name → `flag: 'non-standard-config'`.
- **The algorithm never affects the name.** A RAID 5 with right-asymmetric is still RAID 5 — same
  topology, different placement. Algorithm changes only *how* data lands (and the animation).

Algorithms to cover (from `distribuzione-segmenti-algoritmi.md`): left/right · symmetric/asymmetric,
RAID10 near/far/offset, RAID1E, dRAID, erasure coding (k+m). v1 need not implement all — the schema
must *accommodate* all; the engine tolerates any being absent; only golden-verified ones are offered.

### 5c. RAID-level resource — schema (proposal)

Declares topology requirements, expressed over layouts + min disks. Example
(`raid-levels/raid6.yaml`):

```yaml
id: raid6
name: RAID 6
shape: { layout: parity2, members: disks }   # matched by the recognizer (§4)
minDisks: 4
faultTolerance: 2
parity: { type: distributed, count: 2, algorithm: galois-field-Q }
capacityFormula: "(n − 2) × diskSize"
defaultAlgorithm: left-symmetric
```

---

> **Update 2026-09-02**: §5c is now kept. `src/engine/levels.js` builds a level
> catalogue from these files and `RaidModel.recognize(node, levels)` matches the tree
> against their `shape:` blocks (grammar: the two attributes, `members: disks | arrays`,
> `constraint: even-disk-count | odd-disk-count`, and `childShape` for the nested
> levels — every span must match it). Each file also carries the recognizer's
> one-line `reason:`, and the validator reads `minDisks` there. The hand-written
> recognizer survives as the ORACLE in `tests/levels-oracle.test.js` (849 trees); the
> data is stricter in two places, on purpose: a striped mirror over spans and a
> nesting over unnamed spans (`linear + parity`) no longer get a name. RAID 0+1,
> recognized in code since the combinations phase, got its file.

### 5d. Update 2026-09-02 — back on these rails: the engine reads the resource files

The §5 promise — *adding capability = adding a file, ideally with no engine change* —
was kept for the derivations and broken for the facts: the recognizer, the disk
minimums, the port table and the hardware/fake/software verdict are hard-coded, while
`raid-levels/*.yaml` (`shape:`, `minDisks`), `components/*.yaml` (`provides:`, ports)
are read by nobody (`reference/physical-model-fidelity.md` §3, `informative-ui.md`).
The audit `reference/engine-robustness-and-extraction.md` (2026-09-01) lists the gaps;
Valentina's decision (2026-09-02) is to close them all, in order, before any extraction
of the engine into a project of its own:

1. the physical model (ports, compatibility, verdict) moves into `src/engine/` and is
   fed by a **catalogue** built from `components/*.yaml` — §5a becomes true;
2. the verdict reads capabilities (`provides: raid-engine`, `protocol-translation`)
   and each engine object declares its own verdict, per ADR-001; the tri-mode controller
   then arrives as one file — the §5 acceptance test;
3. the recognizer reads `shape:` from `raid-levels/*.yaml` — §5c becomes true;
4. a build becomes a document (serialize/deserialize; the shareable URL);
5. `@ts-check` on the engine's interfaces.

The living plan, with the checkpoint protocol, is the handoff
`.memory-bank/2026-09-02-0045-agnostic-engine-refactor-plan.md` (local). §5b's
parametric algorithm registry stays deferred: it is placement, not agnosticity.

## 6. Constraint vocabulary (from the notes)

The constraint engine evaluates these over the tree/graph. Each lives **on a resource**, not in
a central rulebook — that's what keeps "add a file" honest.

| Constraint | Source | Type |
|-----------|--------|------|
| min disks per level (5≥3, 6≥4, **10≥4 even / 1E≥3 odd**…) | raid-types | hard |
| a partial Virtual Drive must cover **all disks of the group** | `terminologia.md` | hard |
| nesting with RAID 0 requires the span be **fully** virtualized | `nested-raids.md` | hard |
| a span is a **subset** of a drive group (→ "3 of 4" is allowed) | `terminologia.md` | hard (answers a key question) |
| ~~mirror needs even disk count (odd is invalid)~~ **SUPERSEDED 2026-06-14**: odd striped mirror is the valid RAID 1E level (recognized + placed via near, odd disks). The old hard "odd is invalid" rule was removed. | `distribuzione-segmenti-algoritmi.md` | — |
| ~~RAID engine must sit at exactly one point on the path~~ **SUPERSEDED 2026-07-30**: hw vs. fake is not a position on the path — a hardware RAID card and a fake-RAID chip can occupy the identical slot. The discriminant is which of two distinct engine objects is placed (compute silicon vs. metadata-only); software is the position where neither is present. See [ADR-001](../../reference/decisions/001-engine-identity-not-position.md). | RIEPILOGO image | hard (determines hw/sw/fake) |
| NVMe bypasses backplane + controller | `protocolli-dischi.md` | hard |
| RAID 10 `near/far/offset` layout requires **software RAID / Linux** (mdadm); hw/fake → nested 1+0 only; Windows Storage Spaces → its own flat scheme (columns/copies, not near/far/offset) | cross-axis: control path **gates** the layout menu | hard |
| members of a span *should* span different backplanes | `terminologia.md` | **soft** (best practice / warning) |
| **mixed disk sizes inside a mirror or parity array** → every member is coerced to the smallest, the remainder is unusable. **RAID 0 / linear are exempt**: md does not coerce, `create_strip_zones` zones the leftover of the larger disks (verified 2026-07-25) | `drivers/md/raid0.c` | **soft** (added 2026-07-25) |
| **spans of unequal capacity under one parent** → a *mirror* parent keeps one copy's worth and is limited to the smallest span; a *striped* parent loses no capacity, but the tail of the volume is striped over fewer spans and is slower there | `drivers/md/raid0.c` + §5c | **soft** (added 2026-07-25) |
| hot-spare capacity ≥ coerced capacity of failed disk | `terminologia.md` | runtime module — deferred |

**[DECISION]** Prompt mode *blocks* on hard constraints step-by-step; sandbox *allows the
mistake* and explains why it's invalid. Same validator, different enforcement timing. Soft
constraints are warnings in both. Confirm.

---

## 7. The animation (axis B, made visible)

The author's goal — *"see the order in which data lands on the disks"* — is driven entirely by
the algorithm's `placement` descriptor. The current `animateWrite` (`engine.js`) already does a
primitive version via `animOrder`; the generalized animator interprets the descriptor to compute,
per stripe, the `(disk, role: data|parity|mirror, sequence)` mapping, then plays it.

`segment-allocation-rule-left-symmetric.md` is the worked reference: its two tables (parity
placement, then data fill with wrap-around) are exactly what the animator must reproduce — and the
two-span example there is the RAID-50 case from §3.

**The placement domain is narrower than the recognizer domain.** `model.js` names (or flags) *any*
topology and always derives capacity + fault tolerance (they depend on redundancy + `copies`). But a
data *placement* exists only where it is real and golden-verifiable. So a build can be valid,
non-standard-named, with defined capacity/FT — yet have **no defined placement** (e.g.
`linear+parity1`: parity needs a stripe to be computed over; an odd-count `striped+mirror` (RAID 1E):
not yet verified). In those cases `computePlacement` returns `{unsupported, reason}` and the UI shows the
reason — it never invents a fake grid. Faithfulness over coverage.

---

## 8. Terminology (locked, from `terminologia.md`)

```text
Physical disks
   ↓
Drive Group        ← controller gathers the disks here
   ↓
Span(s)            ← subset(s) of the drive group; each can carry its own layout
   ↓
Virtual Drive (VD) ← logical volume exposed to the OS
```

- **Stripe width** ≠ disk count necessarily; **stripe size** = interleaved segment length
  (excl. parity); **strip size** = segment on a single drive.
- Disk striping/mirroring/parity/spanning definitions, parity types (dedicated/distributed),
  hot-spare types (global/dedicated) → see notes; folded into component/algorithm popups.

---

## 9. Open decisions (collected)

1. ~~**[§4]** Allow + animate unrecognized-but-valid compositions?~~ **RESOLVED: yes**, via an explicit `non-standard-config` flag (recognition ≠ validation).
2. ~~**[§5b]** Accept ~90% data-driven?~~ **RESOLVED: yes**, with graceful degradation as a hard requirement (engine never crashes on a missing/partial algorithm).
3. ~~**[§6]** Prompt = block step-by-step, sandbox = allow + explain?~~ **RESOLVED: yes** (exact UI to be designed later).
4. ~~Component granularity: model backplane-diversity?~~ **RESOLVED:** backplane exists as a path node from v1; the **diversity soft-rule is deferred** (additive — a file + one soft constraint, touches nothing in the core).
5. ~~Migration: rebuild Build tab or new tab?~~ **RESOLVED: build new.** No retrofit of the linear quiz. Reuse `styles.css` + the shared infrastructure (YAML loader, popup, KaTeX) only — those are engine, not quiz. The quiz is retired.
6. ~~**[§5c]** Challenge model: match a target RAID level, or satisfy requirements?~~ **RESOLVED: requirement-satisfaction.** A challenge states *requirements over derived outcomes*, and **any** topology meeting them wins — multiple valid solutions, no "one right level." The `targetRaid`/`failureMessages` YAMLs were rewritten. **Final shape (implemented, see §11a):** the challenge YAML is the *single source of truth*; `requirements` is a **complete record** keyed by every metric in a fixed vocabulary (each entry a constraint or the literal `any`), read generically. The disk supply is expressed *as requirements* (`diskCount`, `rawCapacityGB`) — the palette is **not** restricted, because interpreting the brief is part of the challenge. `validateChallenge` + `challenge-data.test.js` make a malformed challenge fail loudly instead of shipping as a silently-unwinnable level. No `successMessage`: a generic win banner only (naming a level would contradict "any topology wins").
7. ~~**[§4b]** How to treat performance in requirements (it's qualitative)?~~ **RESOLVED: make it measurable.** Real formulas (write-penalty + parallelism → IOPS) derive `readClass`/`writeClass`; "optimize for X" becomes an outcome check like FT/capacity. Source-pinned in Stage B.
8. ~~**[§2]** How do the data view and physical view bridge?~~ **RESOLVED: Option 2 — the disk is the shared atom.** One drag, two views, auto-routing by protocol in v1; the engine is the conceptual weld. (Rejected: drive-group-plug, full-merge.)
9. ~~**[§3a]** RAID 10 nested or flat?~~ **RESOLVED: flat.** A single `striped+mirror` array (copies 2) — the mdadm model — so near/far/offset are real, selectable layouts (they don't decompose into mirror pairs). near/far/offset are the **mirror-class** placement algorithms, siblings of the parity-class (left/right × sym/asym): one `algorithm` slot per array, options scoped by redundancy, never combined. RAID 50/60 stay nested. Motive: the flat model teaches the *real* RAID 10 — and a game that teaches the real thing is the point.

---

## 10. Relationship to existing code

**Decision: build new, do not retrofit the quiz (§9.5).**

- **Reuse:** `styles.css` and the shared infrastructure — the YAML loader (`loadYaml`/`Cache`),
  the popup system (`openPopup`/dismiss), KaTeX rendering. These are engine, not quiz.
- **Retire:** the linear Build quiz (`renderBuildUI`/`validateBuild`/drag-drop-to-count) and the
  bespoke `RAID_LAYOUTS` + `buildRaid10*` family — they are the symptom of a **non-recursive**
  model and have no place in the composition approach.
- **Subsume:** the **Visualize** static gallery becomes the *output of a build* — a composed tree
  produces the very animation the gallery used to show pre-canned. It can remain during transition.
- **New home:** a new module (tab or page) is the centerpiece. The Knowledge Base / intro content
  stays as reference.

---

## 11. Build roadmap (phased)

Ordered so each phase is testable and the *overall sense stays visible* while we break it into pieces.
Each phase ends in something runnable.

| Phase | What | Why this order |
|-------|------|----------------|
| **0 — Scaffold** | New module: empty canvas + sidebar shells, reusing `styles.css` + loader + popup + KaTeX. | Establishes the new home without touching the old quiz. |
| **1 — Model + recognizer** (headless) | The recursive `Disk`/`Array` tree (§3); the level recognizer with `non-standard-config` flag (§4); derived capacity + fault-tolerance. | The brain. Pure logic, testable with no UI — *"build this tree → what is it?"* |
| **2 — Layout + animation** | Parametric primitives (`stripe`, `parity-rotate`, `mirror-near`) reading `placement` descriptors (§5b); graceful degradation. Start: left-symmetric + stripe + mirror-near. | Makes axis B *visible*; the animator becomes the verifier of the notes' tables (§7). |
| **3 — Canvas build** | Drag components from sidebar; group disks into spans; nest arrays. Produces a tree → feeds phases 1 + 2 live. | The interactive heart. Composition replaces selection. |
| **4 — Control path** (axis A) | Place disks→backplane→HBA→engine→OS; engine placement ⇒ hardware/software/fake (§2). Backplane = single node (diversity deferred). | The hw/sw/fake distinction the author cares about. |
| **5 — Constraints + two modes** | Validator (hard/soft, §6); sandbox = allow + explain; prompt = block step-by-step + "client" scenarios. | Turns the builder into a *game*. |
| **— Deferred module** | Runtime: drive states, hot-spare rebuild, failure simulation (`drive-states.md`). Backplane diversity soft-rule. | Separate axis (§2); additive, not blocking. |

### Status & replanned detail (2026-06-02)

**Phases 0–4 are implemented and merged to `main`** (29 commits, prior branch
`feature/raid-sandbox-domain-model`): recursive model + recognizer (1), layout + animation
(2 — left-symmetric + 4 verified parity algorithms), the non-nested canvas build (3), and the
physical control path (4). All engine tests green.

The remaining work was **replanned** into runnable stages. Current branch:
`feature/raid-shared-disks-nested` (Stage A); Phase 5 gets its own branch after A merges.

```
A · SHARED DISKS + NESTED            ← foundation + completes phases 2/3 for nesting
   A0  bridge (Option 2, §2): the disk is the shared atom across both views, auto-routed
   A1  array-onto-array gesture (controller drop dispatch — the "no-op in Phase 3" door)
   A2  visual nesting: a parent container wrapping the sub-arrays in the data view
   A3  RAID 10 → FLAT (§3a): model.js recognizes striped+mirror+disks (even) as RAID 10
       (copies 2; capacity sum/2; FT 1); UI offers near/far/offset on a mirror array;
       placeRaid10() lays out near/far/offset over the flat disks, verified vs
       layout-raid10-reference.js. (RAID 50/60 placement = compose nested spans — later.)

B · PERFORMANCE, MEASURABLE          ← §4b: readClass/writeClass from formula, source-pinned; seq vs random

C · VALIDATOR (Phase 5 core)         ← validator.js (pure) → {hard, soft}; composed into evaluate()
                                        → `violations`. All fundamental §6 constraints, incl. the
                                        per-disk ones A0 makes expressible.

D · TWO MODES (Phase 5 game layer)   ← sandbox: violations shown live ("does this make sense?");
                                        requirement-based challenge schema (replaces the retired
                                        targetRaid/failureMessages YAMLs); checkChallenge() win-check
                                        ON TOP of evaluate(); prompt-mode UI.

E · INTEGRATION + DISCOVERABILITY    ← the ship: retire the linear quiz, AND add the game URL
                                        (/games/raid/) to sitemap.xml — currently only the homepage
                                        is listed, so the game is invisible to Google. Add at ship
                                        time, not before (else it points crawlers at the dead quiz).
```

**Architectural commitments from the replan:** `evaluate()` is loose, read-only orchestration;
new logic goes in its own pure module and only *attaches* output to the result object (the pattern
that already bolted on the physical layer). The recursive tree means nesting needs **additions, not
rewrites** — model/recognizer/compile already recurse; only the gesture, the visual, and
`placeRaid10()` are new.

### Completion log

- **Stage A, E — merged to `main`** (see git history): shared disks + nesting + flat RAID 10;
  sandbox as the front door, linear quiz retired, sitemap updated.
- **Phase 5 (B, C, D) — DONE 2026-06-07**, branch `feature/raid-phase5-game`:
  - **B** `model.js` `analyze()` derives `readClass`/`writeClass` + a `performance{}` block
    (write penalty W × parallelism N → multipliers vs one disk; `random` + `sequential`,
    the §4b parity-amortization nuance). Nested arrays inherit the span's W. Also exposes
    `rawCapacityGB` (sum of disk sizes) for challenge supply checks.
  - **C** `validator.js` (pure) → `{hard, soft}`; §6 constraints (min-disks recursive, mirror-even,
    NVMe-bypass, engine-single-point >1, cross-axis near/far/offset→Linux mdadm; backplane-diversity
    dormant per §9.4). Attached to `evaluate()` as `violations` via a derived physical adapter —
    no rewrite. Sandbox shows violations live (allow + explain).
  - **D** requirement-satisfaction challenges (§9.6, schema in §11a); `challenge.js`
    `checkChallenge()` + `validateChallenge()` on top of `evaluate()`. Prompt-mode UI in `canvas.html`
    (mode dropdown Sandbox/Challenge, challenge list in the results panel, `?challenge=<id>`,
    live requirement checklist + generic win banner). Scope (§9.3): explain-in-both-modes,
    gate-the-win-in-prompt; step-by-step gesture blocking deferred.
- **Hardening from in-browser review (same branch):**
  - `evaluate()` now `_reconcile`s roots/members from ground truth before analyzing → the recognizer
    survives any group/dissolve/remove/re-add history (was: a phantom root blocked recognition).
    Fuzz-tested over 6000 random gestures (`canvas-state.fuzz.test.js`).
  - Physical view disk layout reflows each render (was: positions drifted/overlapped after churn).
  - `[hidden]{display:none !important}` so hidden panels actually hide over class `display` rules.
  - `CanvasState.reset()` + a header **⟲ Clear** button (master clear, both modes).
- **DONE 2026-06-14 (combinations phase):** RAID 50/60 nested placement + animation (canonical
  write order, hand-verified vs Linux raid5.c); RAID 1E (odd striped mirror) recognized + placed
  (near, odd disks, raid10.c); RAID 100 + RAID 51/61/0+1 recognized; near/far/offset golden-verified;
  validator made consistent with RAID 1E. Layouts anchored to the Linux md source; golden tables
  hand-derived (not dumped from the engine). See `tech-debt/nested-data-allocation-order.md`.
- **Deferred (unchanged):** runtime module (drive states, rebuild, failure sim), backplane
  diversity, sequential-class challenge metrics (engine-complete, challenge-dormant in v1),
  parametric algorithm registry (wire `layout.js` to `data/algorithms/*.yaml`),
  dRAID / erasure-coding (k+m). NEXT: validator robustness + cross-axis constraints (phase 2).

**Awaiting:** a refactoring pass (planned, separate session) → then merge
`feature/raid-phase5-game` → `main`. All engine tests green (134): model-perf 29 · validator 15 ·
challenge 20 · challenge-data 13 · canvas-state 29 · canvas-state.fuzz 6 · layout-golden 16 ·
canvas-algo-integration 6.

### 11a. Challenge schema (v1, final — the contract for authoring challenges)

A challenge file (`data/challenges/<id>.yaml`) is the **single source of truth**. The `prompt` is
flavour; the machine reads only `requirements`.

```yaml
id: resilient                  # must equal the filename
title: Large Archive, High Risk # must equal the index.yaml entry
client: "Archivist, …"          # flavour (shown as 🗣)
prompt: >                       # flavour brief — NOT checked
  …six 4 TB disks… survive two simultaneous failures.
requirements:                   # COMPLETE record: every vocabulary metric present
  diskCount:      { op: '==', value: 6 }    # supply
  rawCapacityGB:  { op: '==', value: 24 }   # supply  (6 × 4 TB)
  capacityGB:     any                        # outcome (unconstrained → "any")
  faultTolerance: { op: '>=', value: 2 }    # outcome
  readClass:      any
  writeClass:     any
hint: …                         # flavour, revealed on demand
```

- **Vocabulary** (each must be a key in `RaidModel.analyze()`): `diskCount`, `rawCapacityGB`,
  `capacityGB`, `faultTolerance`, `readClass`, `writeClass`. Defined once in `challenge.js`
  (`METRIC_LABEL`/`KNOWN_METRICS`); adding a metric = add it there **and** in `analyze()`.
- **Each entry** is `any` (unconstrained) or `{ op, value }` with `op ∈ >= · <= · == · in`
  (`in` takes a list, e.g. `[high]`). The record must be **complete** (all metrics) with **≥1**
  non-`any` constraint.
- **Supply is a requirement, not a palette restriction** — the sidebar stays full; reading the
  brief is part of the challenge. `diskCount` + `rawCapacityGB` pin "N disks of S TB".
- **Win** = all requirements met AND no hard violation (`blockedBy`); shown as a generic banner.
  No per-challenge `successMessage` (any valid topology wins, so naming a level would be wrong).
- **Guard:** `challenge-data.test.js` runs `validateChallenge` over every real YAML (via pyyaml→json,
  since the repo is zero-dependency) and checks `index.yaml` consistency — a malformed challenge
  fails the test instead of shipping as a silently-unwinnable level.
