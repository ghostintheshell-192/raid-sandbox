---
type: feature
priority: low
status: open
discovered: 2026-09-25
related: [kb-notation-used-before-it-is-explained.md]
related_decision: null
---

# Inline code and math variables blend into the knowledge-base prose

## Problem

On a knowledge-base page, three kinds of token sit inside a sentence and read almost
like the words around them:

- a line of code quoted from a source, such as
  `pd_idx = data_disks - sector_div(stripe2, raid_disks)` on the parity page;
- a single name quoted as code: `md`, `mdadm`, `raid5.c`, `stripe_width`;
- a math variable: *D₁*, *P*, *k*, *g*.

The reader should see at a glance that these are not prose: a name to type, a symbol
defined above, a line taken from the kernel.

## Analysis

The whole site is set in one monospace face (JetBrains Mono), so the usual signal for
code, a monospace font, is not available: the prose is already monospace. Inline code
is marked only by a faint background (`.kb-section code` in `styles/kb.css`: 
`--bg-secondary`, 0.9em). Math variables are marked only by italics (`*D₁*` in the
markdown, `<em>` in the page), and italics also mark emphasis and defined terms, so a
variable looks like a stressed word.

## Possible Solutions

- **Option A**: stronger inline-code style: a contrasting colour for the text (the
  accent or a dedicated token), a visible border or a darker background. Cheap, CSS
  only. It separates code from prose but not variables from emphasis.
- **Option B**: a separate markup for math variables in the KB markdown subset (for
  example `$D₁$`, rendered as `<var>`), styled on its own: a different colour, or a
  serif italic face used only for variables, as textbooks do. Needs a change in
  `kb-markdown.js` and a pass over the YAML to convert the variables.
- **Option C**: A and B together.

## Recommended Approach

To be determined with Valentina, trying the styles live on a page (Playwright
injection on the live page, as for the side nav). Option C looks like the complete
answer: code and variables are two different things and should look different from
each other as well as from prose.

## Notes

- Formula blocks (`text` fences) are already set apart as figures; this is about
  tokens inside a sentence.
- `<var>` is the HTML element for a variable in a mathematical expression.

## Related Documentation

- **Related Issues**: `kb-notation-used-before-it-is-explained.md`
- **Code Locations**: `styles/kb.css` (`.kb-section code`), `.development/scripts/lib/kb-markdown.js` (inline markup)

---

📍 **Investigation Note**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) to locate relevant files and understand the architectural context before starting your analysis.
