# Specs — what is written down, and what is not yet

A spec here answers one of two questions:

- **`implemented/`** — *what the system does, and why it was built that way.* Written to
  survive the session that produced it.
- **`planned/`** — *what a piece of work is meant to become,* written just before that
  work starts.

Two neighbouring folders hold different things, and the distinction is worth keeping:

- **`../reference/decisions/`** — ADRs. A **decision** and its trade-offs. An ADR says
  *why this and not that*; a spec says *what it is and how it works*.
- **`../reference/`** — analyses and fidelity notes. Study material, not commitments.
- **`../tech-debt/`** — one file per known problem, with its cost and its fix.

## When a spec gets written

**Just in time, not in advance.** A spec written long before the work is a document the
first day of implementation contradicts. So a roadmap item gets its spec when it is
picked up — except when the thinking already exists (then it is written down straight
away), or when the deliverable *is* the document (a census, a map: the spec and the
product are the same file).

Retrospective specs are the other case, and they are not optional: when a large piece of
work lands, what remains of it must be in the repository. The session diaries in
`.memory-bank/` are local and are not a record anyone else can read.

## The roadmap, and where each item is written down

The roadmap itself — priority order, sizes, starting points — is in
[`../CURRENT-STATUS.md`](../CURRENT-STATUS.md). That file is the authority on *order*.
This table only says whether the thinking has a home.

| # | Roadmap item | Document | State |
|---|---|---|---|
| 0 | Degenerate levels — what the player has, next to what they tried to build | [`implemented/degenerate-levels.md`](implemented/degenerate-levels.md) | **implemented 2026-09-05** (PRs #35–#37, one day after the spec was written from the idea note of 2026-09-04); §11.1 answered from `raid5.c` |
| 1 | Refusal points (structural vs. UI) | [`../reference/refusal-points.md`](../reference/refusal-points.md) | **done** — the map, the animation gate decision, and the four gaps that remain |
| 2 | Info icons ("i") | [`planned/informative-ui.md`](planned/informative-ui.md) + [`../reference/unspoken-content.md`](../reference/unspoken-content.md) | the July inventory, now answered from the other side: the text is written and unreachable, so the work is a channel |
| 3 | Knowledge base rework | [`../reference/unspoken-content.md`](../reference/unspoken-content.md) | three findings to inherit: the level prose it never sees, a vocabulary contradicting spec §8, a key parameter it advertises and the game cannot compute |
| 4 | The verdict, drawn | [`planned/derived-controller.md`](planned/derived-controller.md) | identity implemented; the drawing is the open requirement at the end of that file |
| 5 | Technical queue (S each) | `../tech-debt/` | one file per item; no spec needed |
| 6 | Challenges on the physical axis | domain model §11a | the challenge schema exists; the physical vocabulary is the addition |
| 7 | The third axis — runtime | domain model §2 ("third axis") | deferred module, sketch only — needs its own spec |
| 8 | Italian version | — | to write when picked up |
| 9 | Accessibility | — | to write when picked up; starts from an audit |
| 10 | Extracting the engine | [`../reference/engine-robustness-and-extraction.md`](../reference/engine-robustness-and-extraction.md) §4–§8 | analysis done; the decisions (second domain, name, scope) are open |

## What is implemented

| Document | Covers |
|---|---|
| [`implemented/raid-sandbox-domain-model.md`](implemented/raid-sandbox-domain-model.md) | the design backbone: the two axes, the recursive tree, level and performance derivation, the three resource families, the constraint vocabulary, the challenge schema |
| [`implemented/agnostic-engine.md`](implemented/agnostic-engine.md) | how the domain facts moved out of the engine and into the data files (five steps, 2026-09-02) |

## The decisions behind them

| ADR | Says |
|---|---|
| [001](../reference/decisions/001-engine-identity-not-position.md) | the RAID engine's type comes from which object it is, not where it sits |
| [002](../reference/decisions/002-the-engine-holds-no-domain-facts.md) | the engine holds no domain facts — it reads them from the data files |
