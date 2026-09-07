# ADR-004: Every statement names where its truth comes from — cited, derived, chosen, or to verify

**Date**: 2026-09-07
**Status**: Accepted
**Impact**: high
**Summary**: Every strong statement the project makes — on a knowledge-base page, in a level file, in what the sandbox draws — is in exactly one of four states, defined by *where a reader would go to check it*: **cited** (a public source, in the bibliography), **derived** (by hand from a public rule, in a tracked derivation the tests hold the engine to), **chosen** (a decision made for the game, recorded as such), or **to verify** (a queue, every item with a destination). No state is expressed by linking one of our own files or functions. The repository is public; that is said once, as a sentence, never as a link.

## Context

The project's founding discipline (`principles.md`) is: *the whole point of the sandbox is
that what it shows is true, not merely self-consistent.* On 2026-09-07 a review of the
knowledge base written the day before found that the vocabulary the project uses to say
"this is true" does not distinguish three different acts — **citing** a source,
**checking** against a source, and **deriving** something ourselves. One word covering
two of them is the same conflation in four places:

- **`sources:` on the knowledge-base entries** does three jobs under one name. Of 107
  entries, 32 point at our own files: some as *implementation* (`src/engine/model.js
  capacityGB()` — "the rule the sandbox computes with"), some as *provenance* ("the text
  this entry migrates", six pointers to `data/intro.yaml`), some as the *only* thing
  behind a statement about real hardware (`backplane`, `hba`, `bbu`, `raid-engine` cite
  `data/components/*.yaml`). The last kind points at a file of the project's own.
- **`verificationStatus` on the algorithm files** has three values (`verified`,
  `reference-only`, and `status: pending` with a comment that says `layout.js` does not
  implement RAID 10 — it does). All four parity algorithms say `verified`; the header of
  `layout-golden.test.js` says three of them are "derived analytically, internally
  consistent, awaiting independent external verification before being exposed in the
  production UI"; the palette offers all four. The YAML's `verified` means *cited to
  the kernel*; the test's means *hand-tabled and checked*.
- **The derivation behind the golden tables is not in the repository.** The tables
  themselves are in `layout-golden.test.js`, which is where the discipline is enforced.
  The derivation they were transcribed from is named, by `layout.js`, the test, four
  algorithm files and the `note:` of two level files, through paths the repository does
  not contain. Of the four parity algorithm files, three name the kernel function as
  their source; the fourth, left-symmetric, names one of those paths.
- **The hardware claims are marked "not yet verified" since ADR-001.** ADR-001
  (2026-07-30) says in its Cons that its claims about RST firmware, add-in chips and SoC
  integration "are written from prior knowledge and not yet verified against a primary
  source"; three later documents (`derived-controller.md`, `degenerate-levels.md`,
  `unspoken-content.md`) repeat the caveat, and the four hardware entries of the
  knowledge base rest on the same claims. A reading list for them, started on
  2026-07-31, is tracked as `reference/adr-001-hardware-claims-sources.md`. The
  *to verify* queue of this ADR is where that work lives.
- **`to-verify` was redefined once already** (knowledge-base spec §14: from "no sources"
  to "at least one sentence unchecked") — the same move, one step earlier.

The question that unifies them, as Valentina put it: *what is the source of truth for
every statement we make, on a page or in the sandbox?* Answering it once, for every
kind of statement, is this decision.

## Decision

### 1. Four states, defined by where the reader goes to check

Every strong statement is in exactly one state. The state is named by the act a reader
would perform to verify it, not by who performed it:

| state | what it means | where the reader checks |
|---|---|---|
| **cited** | a public source says it | the bibliography: a URL |
| **derived** | we derived it by hand from a public rule, and a test holds the engine to that derivation | the rule is cited; the derivation is in the repository; the page says so in a sentence |
| **chosen** | a decision we made for the game, not a fact about the world | a footnote on the page, where the choice bites; the design-decisions page lists them all; an ADR where one exists |
| **to verify** | not yet checked against a primary source | nowhere yet — the state is temporary and visible |

**cited** is the default and carries no mark: a page whose every sentence is cited shows
its bibliography and nothing else. *derived* and *to verify* are marked on the page,
under its heading. *chosen* is different in kind — a page is not chosen, a statement is —
so it is marked where it bites, as a footnote (§5). A level page, whose grid *is* a
golden table drawn, is marked *derived* like the algorithm page — for completeness, so
that no page that rests on our derivation is silent about it. Marking a single sentence, rather than a page, as *derived* or *to verify* is deferred (see *Consequences*).

### 2. The source of truth depends on the kind of statement

We identify three anchors:

- **Layouts** — where a chunk, a parity block, a copy goes: the kernel source,
  `drivers/md/raid5.c` (`raid5_compute_sector()`), `raid10.c`, `raid0.c`,
  `md-linear.c`. This is where the golden-table discipline applies.
- **Definitions and numbers** — capacity, fault tolerance, write penalty, what a level
  *is*: the papers (Patterson–Gibson–Katz 1988; Anvin for RAID 6; Salem–Garcia-Molina for
  striping) and the `md(4)` / `mdadm(8)` man pages. The driver implements these; it does
  not define them.
- **Hardware and other engines** — backplane, HBA, RAID-on-Chip, cache protection,
  Storage Spaces: standards (T10 SES, SFF-8485) and vendor documentation (Broadcom
  MegaRAID and CacheVault guides, IBM Redbooks, Microsoft Learn).

### 3. `sources:` is a bibliography and nothing else

`sources:` carries URLs where a reader can retrieve the reference for what the page says,
and from there widen their reading. Every entry is `ref` + `url` (+ `note`), and `url`
is `https?://`. Nothing else goes in it: not implementation pointers, not provenance, not
cross-references to other pages (that is `related:`). `tests/kb-data.test.js` enforces
the URL shape, which turns the rule into something the suite checks.

### 4. The golden tables are derived by hand, tracked, and read by the test

Every layout the sandbox draws gets one derivation document in
`.development/reference/golden-tables/<layout>.md`: the kernel rule quoted with its
function, the derivation step by step, the resulting table in a fixed text form. Derived
**from the rule, never from the engine** (`principles.md`, unchanged). The set is
bounded: the layouts `layout-golden.test.js` already covers (four parity algorithms, RAID
6 Q placement, RAID 10 near/far/offset, RAID 1E, RAID 50/60/100) plus any layout added
later — one representative width each, plus the widths where the rule does something
special (odd disks for RAID 1E, RAID 6 at five).

`layout-golden.test.js` reads its expected grids **from those documents**, so there is
one copy of every table and the derivation is the authority. The parser is a few lines
over a fixed grammar, zero dependencies — the same move `kb-worked.test.js` made for
capacity formulas. Every place that names a derivation — `layout.js`, the test, the
algorithm files, the level files — names the reference document.

The three parity algorithms currently "derived analytically" from an abstraction of the
rule are **promoted, not relabelled**: their tables are derived by hand from
`raid5_compute_sector()` like left-symmetric's, and only then say *derived*.

Every reference document is written from the kernel rule, without looking at the
engine or at the test. Where its table disagrees with the one the test holds today, the
kernel decides.

### 5. The model's choices are footnotes, indexed on the design-decisions page

What was decided for the game rather than found in a source — Q left of P (the DDF
convention, where mdadm's default is Q right of P); the three engine cases; the level
derived from the composition rather than selected; the cross-span stacking convention
the kernel does not define; RAID 0+1 satisfying the `database` challenge — is explained
**where the reader meets it**: a footnote mark on the sentence, and at the foot of the
page the note — *this is a design choice of the sandbox, for this reason* — with the ADR
named where one exists. The reader does not leave the page to learn that a statement
is ours.

The design-decisions page (§7) keeps a chapter that **lists** the choices, one line
each, linking the page whose footnote explains it. The explanation exists once, in the
footnote; the chapter is its index. This costs the page markdown one piece of syntax it
does not have today — a footnote reference and its definition — in the hand-written
renderer (`kb-markdown.js`, one inline pattern and a footer block) and a test.

### 6. `to verify` is a queue, not a category of truth

There is no statement about hardware for which no source exists: if none can be found,
either the reading has not been done or the statement is wrong. So every item in this
state has a destination — *cited*, *derived*, *chosen*, or removal — and the four
entries in it today already have named reading: the Broadcom MegaRAID guide (already in
the bibliography) for HBA versus RAID controller; Broadcom CacheVault documentation for
cache protection; T10 SES and SFF-8485 for the backplane; IBM Redbooks as the generic
reputable reference the pages speak at the level of.

### 7. One page, `design-decisions`, in chapters

The page *Why Linux md is the reference* already says the promise ("every rule stated
here can be read and checked in the code, function by function"). It becomes the first
chapter of a single page, **`design-decisions`**, whose chapters are the things the
project decided rather than found: *why Linux md is the reference*; *how the pages are
sourced* — the four states in a reader's words, and the one sentence that the
repository is public; *the model's choices* (§5). One page keeps the reader's mental
model in one place; chapters keep it ordered. The id `why-linux-md` retires; the pages
that link it link the chapter instead (`[[design-decisions|…]]`). Every marked page
links this page.

## Rationale

- **Because the discipline was already written and had drifted from itself.** ADR-002
  did the same for facts in the engine: it did not invent a direction, it made an
  existing one binding. This ADR is that move for the *truth* of what the project says.
- **Because internal coherence is not evidence.** The knowledge base can prove it agrees
  with the engine (`kb-worked.test.js` does exactly that, and says so). That proves we
  are consistent with ourselves. The chain that matters — page agrees with model, model
  agrees with primary source, therefore page agrees with primary source — holds only
  where the middle link is *enforced*. Today it is enforced for one algorithm, against
  a derivation the repository does not contain. Section 4 is what makes the chain hold
  for the axis where it can be checked at all.
- **Because a state named by the reader's act cannot mean two things.** "Verified" can
  mean cited or checked. *Cited / derived / chosen / to verify* each name one act.
- **Because the derivation is bounded work.** One table per layout, from a public
  function, in a form the test reads.

## Consequences

### What changes where

- `data/kb/*.yaml` — 32 internal source entries removed; the six provenance pointers go
  (the spec and git history carry them); `raid-is-not-a-backup`'s three page
  cross-references go (already in `related:`); `status:` gains the marked states; the
  four hardware entries stay `to-verify` until read; the level pages are marked
  *derived*. `why-linux-md.yaml` becomes `design-decisions.yaml`, with the three
  chapters of §7; the pages that link `[[why-linux-md]]` link the chapter.
- `tests/kb-data.test.js` — the URL rule tightens from `^(https?://|\.\./)` to
  `^https?://`.
- `.development/scripts/generate-kb.js` and `lib/kb-markdown.js` — render the page mark
  next to the heading, and the footnotes (§5).
- `.development/reference/golden-tables/*.md` — new: one derivation per layout.
- `tests/layout-golden.test.js` — reads its grids from the reference documents; its
  header and every table comment name the document.
- `data/algorithms/*.yaml` — `verificationStatus` replaced by the same four-state
  vocabulary; `source:` names the kernel function and the reference document; the stale
  `status: pending` on the RAID 10 files goes.
- `src/engine/layout.js`, `data/raid-levels/raid100.yaml`, `raid1e.yaml` — the
  derivation each names becomes the reference document.
- `.development/specs/implemented/knowledge-base.md` §14 — the "project files with
  relative links" line is superseded by this ADR.

### Pros

- One vocabulary for the whole project — pages, data files, tests — where today there
  are three (`sources`, `verificationStatus`, `status`) that disagree.
- The golden tables' authority becomes auditable, and the tables exist once.
- Every layout the sandbox draws has its derivation in the repository.
- The bibliography contains public sources only.

### Cons

- **Per-fact marking of *derived* and *to verify* is deferred.** A page is marked as a
  whole. A page with one unchecked sentence among twenty cited ones is marked *to
  verify* entirely. Footnotes (§5) give *chosen* a per-sentence mark because a choice
  is a sentence; extending that to the other two states is a separate, costed decision.
- **The derivation work is real.** The tables — four parity algorithms, RAID 10 and
  the nested levels — have to be written out step by step from the kernel rule, in a
  form the test can read.
- **A `status` field on a page is still a human assertion.** Nothing checks that a page
  marked *cited* is fully cited. The test can enforce the shape of the bibliography, not
  that every sentence has a line in it.

## Decided in discussion (2026-09-07)

The draft left four questions open; Valentina settled them the same evening:

1. **The names** are *cited / derived / chosen / to verify*, as proposed.
2. ***derived* is shown on the level pages too**, for completeness (§1).
3. **The legend is a page called `design-decisions`, in chapters** — why Linux md, how
   the pages are sourced, the model's choices — rather than an extension of
   `why-linux-md` (§7).
4. **The test reads the reference documents** rather than transcribing them (§4).
5. **The model's choices are footnotes** where they bite, indexed on the
   design-decisions page, rather than a chapter the reader has to switch to (§5).

[`reference/adr-001-hardware-claims-sources.md`](../adr-001-hardware-claims-sources.md)
is a reading list, not a verification, for ADR-001's three fake-RAID claims (Intel RST,
JMicron/ASMedia, AMD Ryzen); it feeds the `raid-engine` entry of the queue. The
backplane, HBA and cache-protection entries need their own list. Its Ryzen finding —
some SATA ports come from the CPU die, others from a separate chipset die — is an open
item on ADR-001's wording, outside this ADR.

## See also

- [ADR-002](002-the-engine-holds-no-domain-facts.md) — the same move for facts in the
  engine: an existing principle made binding.
- `principles.md`, *Ground Truth Before Implementation* — the golden-table discipline
  this ADR gives a home in the repository.
- [`specs/implemented/knowledge-base.md`](../../specs/implemented/knowledge-base.md)
  §5.1 and §14 — the `sources` and `status` rules this ADR supersedes.
- `.memory-bank/ideas/2026-09-07-kb-sources-bibliography-only.md` — the idea note this
  ADR promotes; the note's frontmatter records the promotion.
