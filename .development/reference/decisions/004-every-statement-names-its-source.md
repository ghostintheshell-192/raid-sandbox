# ADR-004: Every statement names where its truth comes from — cited, derived, chosen, or to verify

**Date**: 2026-09-07
**Status**: Proposed — draft for discussion on branch `refactor/kb-sources-bibliography-only`
**Impact**: high
**Summary**: Every strong statement the project makes — on a knowledge-base page, in a level file, in what the sandbox draws — is in exactly one of four states, defined by *where a reader would go to check it*: **cited** (a public source, in the bibliography), **derived** (by hand from a public rule, in a tracked derivation the tests hold the engine to), **chosen** (a decision made for the game, recorded as such), or **to verify** (a queue, every item with a destination). No state is expressed by linking one of our own files or functions. The repository is public; that is said once, as a sentence, never as a link.

## Context

The project's founding discipline (`principles.md`) is: *the whole point of the sandbox is
that what it shows is true, not merely self-consistent.* On 2026-09-07 a review of the
knowledge base written the day before found that the vocabulary the project uses to say
"this is true" does not distinguish three different acts — **citing** a source,
**checking** against a source, and **deriving** something ourselves — and that wherever one
word covered two of them, the project was vouching for itself without meaning to. The
same disease shows in four places:

- **`sources:` on the knowledge-base entries** does three jobs under one name. Of 107
  entries, 32 point at our own files: some as *implementation* (`src/engine/model.js
  capacityGB()` — "the rule the sandbox computes with"), some as *provenance* ("the text
  this entry migrates", six pointers to `data/intro.yaml`), some as the *only* thing
  behind a statement about real hardware (`backplane`, `hba`, `bbu`, `raid-engine` cite
  `data/components/*.yaml`). A reader who follows the last kind lands on a file that
  says the same sentence, written by us.
- **`verificationStatus` on the algorithm files** has three values (`verified`,
  `reference-only`, and `status: pending` with a comment that says `layout.js` does not
  implement RAID 10 — it does). All four parity algorithms say `verified`; the header of
  `layout-golden.test.js` says three of them are "derived analytically, internally
  consistent, awaiting independent external verification before being exposed in the
  production UI". They are exposed. The YAML's `verified` means *cited to the kernel*;
  the test's means *hand-tabled and checked*. Same word, two meanings.
- **The ground truth of the whole layout axis is not in the repository.** The golden
  tables — the one place where the discipline is actually enforced by a test — cite
  `.personal/segment-allocation-rule-left-symmetric.md`, `.personal/golden-raid{50,1e,100}.md`
  and `.personal/distribuzione-segmenti-algoritmi.md` as their authority, from
  `layout.js`, `layout-golden.test.js`, four algorithm files and the `note:` of two level
  files. `.personal/` is the first line of `.gitignore`. The test asserts the engine
  against tables whose derivation nobody but the author can open. Paradoxically the one
  algorithm verified in the strong sense (left-symmetric) is the one with the weakest
  public trail: the other three cite `raid5_compute_sector()`; it cites the private file.
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
| **chosen** | a decision we made for the game, not a fact about the world | the page on the model's choices; an ADR where one exists |
| **to verify** | not yet checked against a primary source | nowhere yet — the state is temporary and visible |

**cited** is the default and carries no mark: a page whose every sentence is cited shows
its bibliography and nothing else. The other three are marked on the page, under its
heading. Marking a single sentence rather than a page is deferred (see *Consequences*).

### 2. The source of truth depends on the kind of statement

"The Linux `md` driver" is the answer for what the sandbox *draws* and for behaviour
specific to `md`; it is not the answer for everything, and an ADR that said so would be
wrong on its first day for half the knowledge base. Three anchors:

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

### 4. No reference to our own files or functions, anywhere a reader sees

Not `model.js`, not `capacityGB()`, not `data/components/backplane.yaml`, not a
`.personal/` path. A link to our own file in a bibliography claims an authority it does
not have. Someone who genuinely wants to see how the sandbox computes a number can read
the repository; that is stated once, on the legend page, as a sentence.

The same applies to the tracked data and code: a `source:` field on an algorithm file, a
`note:` on a level file, a header comment in a test, may name a kernel function or a
tracked reference document — never a path under `.personal/`.

### 5. The golden tables are derived by hand, tracked, and read by the test

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
capacity formulas. Every `.personal/` reference in tracked files is replaced by the
reference document, and `.personal/` stops being an authority for anything that ships.

The three parity algorithms currently "derived analytically" from an abstraction of the
rule are **promoted, not relabelled**: their tables are derived by hand from
`raid5_compute_sector()` like left-symmetric's, and only then say *derived*.

### 6. The model's choices get a page

What was decided for the game rather than found in a source — Q left of P (the DDF
convention, where mdadm's default is Q right of P); the three engine cases; the level
derived from the composition rather than selected; the cross-span stacking convention
the kernel does not define; RAID 0+1 satisfying the `database` challenge — is listed on
one knowledge-base page, each item in a sentence, with the ADR named where one exists.
A page that rests on such a choice links it with the existing `[[id]]` syntax. No new
tag, no new syntax.

### 7. `to verify` is a queue, not a category of truth

There is no statement about hardware for which no source exists: if none can be found,
either the reading has not been done or the statement is wrong. So every item in this
state has a destination — *cited*, *derived*, *chosen*, or removal — and the four
entries in it today already have named reading: the Broadcom MegaRAID guide (already in
the bibliography) for HBA versus RAID controller; Broadcom CacheVault documentation for
cache protection; T10 SES and SFF-8485 for the backplane; IBM Redbooks as the generic
reputable reference the pages speak at the level of.

### 8. The legend

The page *Why Linux md is the reference* already says the promise ("every rule stated
here can be read and checked in the code, function by function"). It is extended — or
given a sibling — with the four states in reader's words and the one sentence about the
repository. Every marked page links it.

## Rationale

- **Because the discipline was already written and had drifted from itself.** ADR-002
  did the same for facts in the engine: it did not invent a direction, it made an
  existing one binding. This ADR is that move for the *truth* of what the project says.
- **Because internal coherence is not evidence.** The knowledge base can prove it agrees
  with the engine (`kb-worked.test.js` does exactly that, and says so). That proves we
  are consistent with ourselves. The chain that matters — page agrees with model, model
  agrees with primary source, therefore page agrees with primary source — holds only
  where the middle link is *enforced*. Today it is enforced for one algorithm, against a
  file that does not ship. Section 5 is what makes the chain real for the axis where it
  can be checked at all.
- **Because a state named by the reader's act cannot mean two things.** "Verified" can
  mean cited or checked; "internally verified" says who and hides that the derivation
  starts from a public rule. *Cited / derived / chosen / to verify* each name one act.
- **Because a competent reader sees the gap in five minutes.** The reader the project
  exists for is the one who opens the repository. That reader finds a test whose
  authority is an absent file, and a data file whose `verified` the test contradicts.
- **Because the cheapest honest thing is to do the derivation.** Three hand tables from a
  public function are an evening; a softer label is forever.

## Consequences

### What changes where

- `data/kb/*.yaml` — 32 internal source entries removed; the six provenance pointers go
  (the spec and git history carry them); `raid-is-not-a-backup`'s three page
  cross-references go (already in `related:`); `status:` gains the marked states; the
  four hardware entries stay `to-verify` until read. One new entry for the model's
  choices; the legend on `why-linux-md` or a sibling.
- `tests/kb-data.test.js` — the URL rule tightens from `^(https?://|\.\./)` to
  `^https?://`.
- `.development/scripts/generate-kb.js` — renders the page mark next to the heading.
- `.development/reference/golden-tables/*.md` — new: one derivation per layout.
- `tests/layout-golden.test.js` — reads its grids from the reference documents; its
  header and every table comment name the document, not `.personal/`.
- `data/algorithms/*.yaml` — `verificationStatus` replaced by the same four-state
  vocabulary; `source:` names the kernel function and the reference document; the stale
  `status: pending` on the RAID 10 files goes.
- `src/engine/layout.js`, `data/raid-levels/raid100.yaml`, `raid1e.yaml` — the
  `.personal/` mentions become the reference document.
- `.development/specs/implemented/knowledge-base.md` §14 — the "project files with
  relative links" line is superseded by this ADR.

### Pros

- One vocabulary for the whole project — pages, data files, tests — where today there
  are three (`sources`, `verificationStatus`, `status`) that disagree.
- The golden tables' authority becomes auditable, and the tables exist once.
- The three unverified algorithms become verified in the strong sense rather than
  described more carefully.
- A reader is never handed a link that means "we wrote this".

### Cons

- **Per-fact marking is deferred.** A page is marked as a whole. A page with one
  unchecked sentence among twenty cited ones is marked *to verify* entirely — coarse, and
  the pressure it creates to finish the reading is the point. If that proves too
  coarse, marking a sentence means extending the `[[id]]` mini-syntax of `long:` with an
  inline marker, a render rule and a test: a separate, costed decision.
- **The derivation work is real.** Three parity tables, and the RAID 10 / nested ones
  currently in `.personal/`, have to be written out step by step from the kernel rule,
  in a form the test can read. It is bounded and it is the price of the claim.
- **A `status` field on a page is still a human assertion.** Nothing checks that a page
  marked *cited* is fully cited. The test can enforce the shape of the bibliography, not
  that every sentence has a line in it.

## Open questions (for the discussion, not yet decided)

1. **The names.** *cited / derived / chosen / to verify* are the draft's proposal. The
   word that goes on the pages is Valentina's to pick.
2. **Whether *derived* is shown on the level pages** (whose grids are the golden tables
   drawn) or only on the algorithm page, with the level pages counting as *cited* via the
   kernel rule.
3. **Where the legend lives** — extending `why-linux-md`, or a sibling page it links.
4. **Whether the test reads the reference documents or transcribes them.** The draft
   decides *reads*, on the project's own precedent; the cost is a small parser and a
   fixed table grammar in the markdown.

## See also

- [ADR-002](002-the-engine-holds-no-domain-facts.md) — the same move for facts in the
  engine: an existing principle made binding.
- `principles.md`, *Ground Truth Before Implementation* — the golden-table discipline
  this ADR gives a home in the repository.
- [`specs/implemented/knowledge-base.md`](../../specs/implemented/knowledge-base.md)
  §5.1 and §14 — the `sources` and `status` rules this ADR supersedes.
- `.memory-bank/ideas/2026-09-07-kb-sources-bibliography-only.md` — the idea note this
  ADR promotes; the note's frontmatter records the promotion.
