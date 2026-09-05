# ADR-003: RAID Sandbox is a desktop game — the mobile flow is removed

**Date**: 2026-09-05
**Status**: Accepted
**Impact**: medium
**Summary**: Below the desktop breakpoint the game is no longer offered. A phone or a narrow window gets a short page that says what RAID Sandbox is, that it needs a desktop browser, and points to the knowledge base — which stays readable on mobile. The touch shim, the mobile layout and the accordion palette go; the inline picker stays, as click-to-build on desktop. No mobile version is promised.

## Context

The game was built for a wide canvas: drag disks, group them, set the two axes, watch
the layout animate. Mobile support was added afterwards, in three steps:

- **June 2026** — a responsive pass: the palette wraps and collapses into an accordion
  under 900px, the physical layer folds away, the results panel flows below the canvases.
- **June 2026** — `touch-dnd.js`, a shim that fakes the HTML5 drag-and-drop events on
  touch (press-and-hold 180 ms, then drag), so the controllers work unchanged.
- **July 2026** — the mobile flow inverted (PR #1): tapping an empty zone opens an inline
  picker of what fits there, because drag and scroll compete for the same gesture. It
  was validated in the browser by the author and a designer, and shipped.

Two things were never finished. The **physical layer** got no picker: on touch it is
still the shim, the worst experience in the game
(`tech-debt/physical-layer-canvas-has-no-touch-picker.md`). And the shim itself was
flagged the day tap-to-build landed as *"largely redundant, possibly dead code — to
re-scope"*, and stayed that way for six weeks because nobody could say what to keep.

Meanwhile every change to the interface is designed twice. The two boxes of the
degenerate-levels work (2026-09-05) were laid out for the wide panel *and* for the
single-column flow; the information icons and the knowledge-base rework ahead would be
too. That is the real cost: not the code that exists, but the second target every future
change has to hit.

The site has no audience yet — it has not been announced anywhere. There is nothing to
lose by deciding now, and Search Console will say later how many phones ever arrive.

One more thing depends on this. `.claude/rules/overview.md` justifies the vanilla stack
with *"the bottleneck is interaction (touch gestures), not rendering"*. Without touch,
that sentence no longer carries the argument, and the stack has to be defended on the
grounds that were always there too.

## Decision

**RAID Sandbox is a desktop game.** Below the desktop breakpoint (900px, the line the
layout already used) `index.html` does not offer the canvases. It shows a short page:

- what the game is, in a few lines;
- that it needs a desktop browser — stated plainly, with no "coming soon" and no
  mention of a mobile version, because none is planned and the project does not print
  promises it cannot keep;
- a link to the knowledge base.

A shared `#build=` link opened on a phone lands on that page too, not on a broken
canvas.

**The knowledge base stays readable on mobile.** It is the one page a phone visitor gets,
and its rework (roadmap item 3) designs for that.

**What goes**: `touch-dnd.js`; `sidebar-accordion.js`; the mobile layout in
`sandbox.css` (the ≤ 900px flow, the `pointer: coarse` sizing); the physical-layer
fold-away where it exists only for narrow screens; the `pointer: coarse` and
`(max-width: 900px)` branches in the controllers.

**What stays**: the inline picker. It was written *touch-first*, but it opens on click,
and on desktop it is a second way to build — an empty zone offers what fits — next to
drag-and-drop. It is not mobile code; it is the game's own answer to "what can go here",
and the information icons will lean on the same idea.

## Rationale

- **One target.** Every interface change from here on is designed once, for the wide
  layout. That halves the cost of the roadmap's next three items.
- **The mobile game was never whole.** Half of it (the physical layer) ran on a
  press-and-hold shim that fought the scroll. Finishing it meant a second picker and a
  second round of validation for a surface nobody has visited.
- **Honesty over reach.** A page that says "this needs a desktop" is true. A half-working
  game on a phone teaches the wrong things about RAID and about the project.
- **Reversible.** The removed code stays in the history (PR #1 and the June commits);
  the notice page is an afternoon. If Search Console ever shows a mobile audience worth
  serving, the decision is one revert and one conversation away.

## Consequences

- **Two tech-debts close by deletion**: `physical-layer-canvas-has-no-touch-picker`
  and the `touch-dnd.js` re-scope (roadmap item 5).
- **Smaller surface**: two JavaScript files and the mobile section of the stylesheet go;
  the headless suites are untouched (none of this was ever loaded under Node).
- **A phone visitor loses the game** and gets the knowledge base. Until the site is
  announced, that visitor is the author.
- **The stack argument is restated** in `overview.md`: no build step and no framework
  because the whole game must travel as one link with zero runtime dependencies, be
  readable as source, and be type-checked without a toolchain — not because of touch.
- **Accessibility (roadmap item 9) is unaffected**: keyboard and screen-reader paths are
  a desktop concern, and the click-to-build picker is a better base for them than drag.
- **The knowledge base becomes the mobile front door**, which sets a requirement for its
  rework: readable on a phone, linked from the notice page.

## See also

- `.claude/rules/overview.md` — the stack decision, restated by this ADR.
- `tech-debt/physical-layer-canvas-has-no-touch-picker.md` — closed by this decision.
- `.memory-bank/2026-07-24-2135-mobile-tap-to-build-ci-branch-protection.md` (local) —
  the day tap-to-build shipped and the shim was first questioned.
- [ADR-001](001-engine-identity-not-position.md), [ADR-002](002-the-engine-holds-no-domain-facts.md) —
  unaffected: this decision is about the surface, not the engine.
