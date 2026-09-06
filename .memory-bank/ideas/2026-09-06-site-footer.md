---
captured: 2026-09-06
status: dropped
context: "knowledge-base layout review on feature/knowledge-base — the KB pages got a footer (sandbox link · knowledge base · author); index.html has its own header/footer"
tags: [site, ui, footer, kb]
---

# One footer for every page of the site

> **Done the same evening (2026-09-06)**, not promoted: `index.html` got a footer
> row with the knowledge-base link and the author, the KB pages already had theirs.
> What is left of the idea — one source of truth for the footer's content — is
> still open, and small.

The generated knowledge-base pages carry a footer with the sandbox link, the
knowledge-base link and the author's name. `index.html` has its own header and
footer, written by hand. Valentina's remark while reviewing the KB layout: a
footer should be on every HTML page of the site, and it is the place for the
author's name "and whatever else" (licence statement when there is one,
contact, the repository link if the project ever publishes it).

Why it deserves attention: today the two footers are two pieces of text that
can drift, and the site has no single place that says who made it.

Minimal next step: decide the footer's content once, put it in one place both
`index.html` and `generate-kb.js` read it from (a small data file, or the
generator reading `index.html`'s footer the way it already reads its JSON-LD),
and drop the hand-written copy.
