---
type: feature
priority: medium
status: open
discovered: 2026-09-27
related: [kb-notation-used-before-it-is-explained.md]
related_decision: null
---

# Technical terms in the knowledge base are used before they are explained

## Problem

A technical term often appears on a page before anything says what it is. The
reader meets the word, has no definition at hand, and has to guess or leave the
page. This is the same rule as the one for mathematical notation, applied to
another set of data: the words of the subject instead of its symbols.

The page that raised it is `bbu`, as it was before its verification:

- **The short form.** "It is what makes write-back caching safe on a controller,
  and what closes the write hole there." Neither *write-back* nor *write hole* is
  explained in the short form, and the short form is plain text: it cannot carry a
  link.
- **The search description.** "It makes write-back caching safe and closes the
  write hole." Same two terms, shown in a search results list, with no page around
  them.
- **The long form.** *Relearning* (the battery's learn cycle), *supercapacitor* and
  *NAND flash* are named as if the reader already knew them.

## Analysis

The short form travels further than the long one: it is transcluded on other
pages, shown in tooltips, in the glossary and on the map. It is also the form that
gets the least attention while writing, because it reads as a summary. A term used
there without explanation reaches every place the short form goes.

The search description (`searchDescription`, added 2026-09-27) has the same
constraint and a reader with even less context: someone looking at a results
list.

In the long form the problem is smaller, because a term that has its own entry can
be linked with `[[id]]`, and the writing rules already ask for that: name and link
the actors, let their own entry explain them. The gap is the terms that have no
entry, and the first use that comes before the sentence that defines the term.

## Possible Solutions

- **Option A**: explain in place. The first use of a term on a page carries a
  clause that says what it is ("the write hole, the stripe left with new data and
  old parity when power fails between the two writes").
- **Option B**: link. In the long form, the first use of a term with an entry is
  a `[[id]]` link. Not available in the short form and the search description,
  which are plain text.
- **Option C**: new entries for the terms that recur and have none (candidates:
  write-back and write-through caching, learn cycle), each with its short and long
  form and its sources.

## Recommended Approach

A for the short forms and the search descriptions, where it is the only option. B
for the long forms, with C for a term that recurs on several pages. Audit the
short forms and the search descriptions of every entry first: they are the plain
text, and they are few enough to read in one pass. Then the long forms, page by
page, together with the prose pass.

## Notes

- `bbu` is fixed on its own verification branch (`docs/kb-verify-bbu`); this note
  is for the rest of the knowledge base.
- Raised by Valentina while reviewing the `bbu` verification: "we should not
  introduce technical terminology without explaining, at least the first time,
  what it is".

## Related Documentation

- **Related Issues**: `kb-notation-used-before-it-is-explained.md` (the same rule
  for symbols and formulas)
- **Code Locations**: `data/kb/*.yaml` (`short`, `searchDescription`, `long`),
  the `kb:` block of `data/raid-levels/*.yaml`

---

📍 **Investigation Note**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) to locate relevant files and understand the architectural context before starting your analysis.
