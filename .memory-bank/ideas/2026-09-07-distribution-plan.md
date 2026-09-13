---
captured: 2026-09-07
status: open
context: "SEO session of 2026-09-06/07 — the site's metadata, sitemap and measurement are done; what remains is being found"
tags: [seo, distribution, launch]
---

# Distribution plan — how RAID Sandbox gets found

**What it is.** A new domain with no inbound links does not rank, however good the
pages are. The metadata, sitemap, Search Console and Vercel Analytics are in place
(PRs #41–#44). What moves a domain now is links and mentions from places people
already read. Valentina is not a social-media person and does not want to become one,
so the plan is built on things that are *not* an ongoing presence.

**The message** (not "a site about RAID" — there are a thousand): the level is not
picked from a list, it is worked out from what you built; the layouts follow the Linux
`md` source, with golden tables hand-derived from `raid5.c` and `raid10.c`.

**Channels, in order:**

1. **The technical article** — Valentina's, no deadline. How the layouts were derived
   by hand from the kernel and why the golden tables are never generated from the
   engine (the material is already in `principles.md`, the ADRs and the handoffs). It
   stands on its own, others share it, and it is a second, different shot on HN.
   Method that works for her: first rough draft, then structure it together.
2. **linux-raid mailing list** — one e-mail, correspondence not promotion: "I built a
   visualiser of md's raid5/raid10 layouts, hand-derived from the source; corrections
   welcome." A reply from there is worth more than a thousand visits.
3. **Show HN** — once, when the KB has all the levels (0+1 vs 1+0 is what people argue
   about in comments). Draft prepared here; she posts. Before it: a feedback channel
   in the footer (GitHub issues link — open item in CURRENT-STATUS), so HN can report
   bugs.
4. **GitHub repo topics** (raid, storage, linux-md, education, learning-game) — a
   channel that costs nothing.
5. **Mastodon** — optional; a declared bot account posting release notes is within the
   platform's norms, but it is a changelog, not distribution.

**Decided against:** Reddit (account deleted, and she hates it); an AI agent running
her public face — HN, Reddit and Stack Exchange reject AI-run accounts even when
declared, and the real scale is three actions a year, not a presence. Where an agent
does fit: drafting the posts, reading the replies and summarising them, preparing
answers she decides whether to send.

**Minimal next step:** when the article exists, send it to linux-raid with the sandbox
link; then the GitHub topics (five minutes).
