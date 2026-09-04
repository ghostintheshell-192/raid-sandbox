---
type: bug
priority: high
status: resolved
discovered: 2026-09-04
related: []
related_decision: null
---

# The sandbox says "build valid" while showing a hard violation

> **Resolved 2026-09-04** on `fix/animate-gate-on-hard-violations` (Option B) — see the
> resolution section at the end. Spec §6's open [DECISION] is confirmed in the same change.

## Problem

Two things on the same screen contradict each other. The status bar reads:

> ✓ build valid — click ▶ to animate the write

while the panel below lists a hard violation, and the **▶ animate write** button is
enabled.

## Analysis

Both behaviours come from looking at the wrong signal.

- The status line branches on `r.firstIssue`, which is `_firstIssue` in `canvas-state.js`
  — and that reports only **structural incompleteness**: no disks, arrays with fewer than
  two members, an empty segmentation or redundancy slot, more than one root. Once a build
  compiles, `firstIssue` is `null` **always**, violations or not.
- `btn-animate` is enabled whenever a placement can be computed and is not `unsupported`.
  A build with a hard violation usually places perfectly well — a RAID 10 with `near`
  under Windows lays out exactly like a valid one.

So the word "valid" is being used for "structurally complete", and the animation is being
offered as a property of the placement rather than of the build.

The cost is not cosmetic: the sandbox's whole claim is that what it shows is true. A
screen that asserts a build is valid and simultaneously explains why it is not undermines
the violation, not the button.

## Possible Solutions

- **Option A**: gate on hard violations — the status line stops claiming validity and the
  animate button stays disabled while any hard violation stands. Soft violations gate
  nothing.
- **Option B**: A, plus a status line that names what is blocking, reusing the violation's
  own message rather than inventing a second wording.
- **Option C**: leave the button and only fix the wording ("build complete" instead of
  "build valid").

## Recommended Approach

**Option B**, per the decision recorded 2026-09-04 in `reference/refusal-points.md`: *the
animation is the reward, and the reward waits.* The mistake stays fully buildable and
fully explained — what it does not do is get rewarded. Soft violations describe builds
that are real and merely suboptimal, so refusing to animate them would call them wrong.

Option C is not enough: it fixes the sentence and leaves the button rewarding an invalid
build.

This settles the `[DECISION] … Confirm.` at the end of spec §6, open since 2026-06, and
slightly rewords it — prompt mode blocks step by step; the sandbox allows the mistake,
explains it, and withholds the payoff. **Spec §6 must be updated in the same change.**

## Notes

`evaluate()` already returns `violations: { hard, soft }`, so the predicate needs no new
derivation. The change is in `index.html`'s render path.

Worth checking in the browser: a RAID 5 with 2 disks, and `near` on a non-Linux path —
both place fine and both must now refuse to animate.

## Related Documentation

- **Census**: `reference/refusal-points.md` — "The gap between 'valid' and valid"
- **Spec**: domain-model §6 (the [DECISION] this resolves)
- **Code Locations**: `index.html` (render path, `btnAnimate`, status bar), `src/sandbox/canvas-state.js` (`_firstIssue`, `evaluate`)

## Resolution (2026-09-04)

Option B, in `index.html`'s render path:

- `btnAnimate.disabled` now reads the hard violations, not the placement alone. A disabled
  button also carries `title="Fix this first: <the violation's own message>"` — a control
  that refuses without a reason would be the same defect one level down.
- The status bar branches on the hard violations before falling through to "✓ build
  valid", and shows the violation's **own** message rather than a second wording that
  could drift from the rule that produced it.
- The grid still renders whenever a placement exists: seeing the layout is information,
  the animation is the reward.
- Soft violations gate nothing.

No engine change — `evaluate()` already returned `violations: { hard, soft }`. Spec §6's
`[DECISION] … Confirm.` is now confirmed, with the addition that the sandbox marks a build
invalid by withholding the animation rather than by blocking the build.
