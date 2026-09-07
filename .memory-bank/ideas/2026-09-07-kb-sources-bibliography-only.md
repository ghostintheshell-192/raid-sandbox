---
captured: 2026-09-07
status: open
context: "review of the knowledge base written 2026-09-06 (spec implemented/knowledge-base.md); question about why 32 of the 107 sources point at our own files"
tags: [knowledge-base, sources, honesty, to-discuss]
---

# `sources` is a bibliography, nothing else — the rest is a tag

**To be discussed further.** This note records a position and the evidence behind
it, not a decision.

## The position

`sources:` should carry **one kind of thing only: URLs where a reader can go and
retrieve the reference for what we said**, and from there widen their own reading.
A bibliography. Nothing that is not that belongs in it.

Everything else we currently express by linking our own files is expressed better
by a **tag on the article**, or next to the specific fact it qualifies:

- **`to-verify`** — exists already. At least one sentence has not been checked
  against a primary source.
- **`derived-from-our-model`** — new. The fact is ours: we derived it, and no
  public literature states it. Say that plainly instead of linking a file of ours
  that only means "we wrote this".

**No references to our internal functions or internal files, anywhere.** Someone
who genuinely wants to see how the sandbox computes a number can download the
source. A link to `model.js` in a bibliography claims an authority it does not
have, and dressing our own file up as evidence is the thing worth avoiding.

## Why: internal coherence is not evidence

The knowledge base can demonstrate that its pages agree with the engine. That is
worth something, but on its own it says only that we are consistent with
ourselves. The chain that would actually matter is:

> the knowledge base agrees with the model, the model agrees with the primary
> source (the Linux `md` driver, the 1988 paper), therefore the knowledge base
> agrees with the primary source

— and that chain holds only where the middle link is **enforced**, not assumed.
Today it is enforced in one place (`layout-golden.test.js`), and even there the
anchor is a file that does not ship (see *Not solved by this* below).
`kb-worked.test.js` says outright what it is: *"the worked calculation cannot
contradict the engine"* — words against code, which is internal consistency by
construction.

So: cite the primary source. Where a test genuinely ties the model to it, that is
worth stating — but only once it is true, and stated as what it is.

## What this touches

**32 source entries across 24 files** point at `data/`, `src/` or `tests/`.
They fall into groups that need different handling, and this is where the
discussion has to land:

1. **Numeric concepts** — `capacity`, `fault-tolerance`, `write-penalty`,
   `performance`, `striping`, `segmentation`. These already carry real primary
   sources (the 1988 paper, `md(4)`, `raid5.c`, `raid0.c`, Salem &
   Garcia-Molina, MS Learn). The internal link sits *beside* them and is purely
   additive — dropping it costs nothing but a pointer into the source tree, which
   is exactly the pointer we are saying does not belong.

2. **The four physical actors** — `backplane`, `hba`, `bbu`, `raid-engine`. Here
   an internal file is the *only* thing behind statements about real hardware
   ("passive mid-plane that routes SATA/SAS signals… does not process data"). Not
   coincidentally these are four of the eight current `to-verify`. **Open
   question:** once the internal link goes, do these become `to-verify` (a debt to
   close with a real source: SFF-8485/SES, a Broadcom/LSI guide) or
   `derived-from-our-model`? The distinction matters — see below.

3. **Migration provenance** — the six pointers to `data/intro.yaml`
   ("the text this entry migrates / supersedes"). Not sources at all. This is
   changelog; it belongs in git history and in the spec, not on the page.

4. **KB cross-references** — `raid-is-not-a-backup` lists `redundancy`,
   `fault-tolerance`, `write-hole` under `sources`. All three are already in its
   `related:` line. Pure duplication; it just goes.

## The two tags are on different axes — do not conflate them

- `to-verify` is **temporary and a debt**: unchecked, someone should check it.
- `derived-from-our-model` is **permanent and a statement**: checked as far as it
  can be, and no external authority exists to check it against.

They are not two points on one scale, so a page could in principle carry both (one
sentence unverified, another genuinely ours). Worth deciding whether that is
allowed or whether one entry gets one tag.

Related: the spec (§14) already redefined `to-verify` once, from "no sources" to
"at least one sentence unchecked". Adding a second tag is the natural completion
of that move, not a new idea.

## The harder half: placement

"Under the article heading" is cheap — a field on the entry, rendered in the page
header by `generate-kb.js`.

"Next to the fact being described" is not. Today the `long:` markdown has one
piece of custom syntax, `[[id]]` / `[[id|text]]`. A per-fact tag means extending
that mini-language (something like `{{derived}}` or an inline marker), plus a
render rule, plus a test. That is the real cost of this idea and it should be
weighed on its own — possibly staged: article-level tag first, per-fact marker
only if the article-level one proves too coarse.

## Not solved by this

`data/algorithms/left-symmetric.yaml:34` declares
`source: .personal/segment-allocation-rule-left-symmetric.md`, and `.personal/` is
the first entry in `.gitignore`. `layout-golden.test.js` names the same file as its
*authoritative source*. So the ground truth for the whole B axis is a document
nobody outside Valentina's machine can open, and three of the four parity
algorithms are — by that file's own header — "derived analytically", "internally
consistent", awaiting independent external verification.

Removing internal links from the knowledge base **hides** this from the reader; it
does not fix it. It is a separate item, and arguably the more important one: either
those hand tables become a tracked document under
`.development/reference/`, or the claim about them has to say what it really is.

## Minimal next step

Not code. A decision on the two open questions above (what the four physical
actors become; whether the per-fact marker is in scope), then:

- tighten `tests/kb-data.test.js:93` from `^(https?://|\.\./)` to `^https?://`,
  which turns the rule into something the suite enforces;
- strip the 32 entries, adding `derived-from-our-model` where a claim is left bare;
- `generate-kb.js` renders the tag(s) in the page header next to `status`.

Branch `refactor/kb-sources-bibliography-only` exists for this work; this note is
its first commit.
