# Refusal points — where the game says no, and whether it says why

**Date:** 2026-09-04
**Roadmap:** item 1 (this document *is* the deliverable)
**Companion:** [`unspoken-content.md`](unspoken-content.md) — what the game knows and never says

Every place the sandbox declines something the player tried, or could have tried.
The point of listing them together is not completeness for its own sake: it is to see
whether the *reason* for each refusal ever reaches the player.

## Three ways to say no

The game refuses in three different ways, and the difference decides whether an
explanation has anywhere to live.

| | what happens | is there an event to attach an explanation to? |
|---|---|---|
| **1. It prevents** | the action does not happen — the wire will not form | yes: the player tried something |
| **2. It does not offer** | the option is not there at all | **no** — an absence has no moment |
| **3. It accepts and explains** | the state exists, the panel reports a violation | yes, and it already speaks |

Mechanism 3 is the best one wherever it applies: the player is allowed to make the
mistake and is told why it is one. Mechanism 2 is the worst — the player cannot even
form the question, because nothing tells them there was something to ask.

## 1. It prevents — structural refusals

The engine cannot hold the state, so the action is refused. Every one of these
**produces a written reason that the player never sees**; the code says so explicitly,
in two places: *"the reason is written for a developer or a test, not for the player."*

| where | refuses | test |
|---|---|---|
| `catalog.canConnect` | unknown component · no such port · the source is not an output · the target is not an input · incompatible port types | ✅ `catalog.test.js` [2] |
| `cpCanConnect` | no catalogue loaded · a component wired to itself · a disk wired by hand · unknown node | ✅ `canvas-state.test.js` [13d] |
| `cpConnect` | **throws** when `cpCanConnect` says no, so no test can assert on a canvas no player could draw | ✅ |
| `cpDisconnect` | refuses to delete a *derived* edge (disk → acceptor): routing is domain truth, not a drawing | ✅ |
| `loadDocument` | unknown version · a member naming no node · an array as its own member · a node claimed by two arrays · a wire to an absent component · a wire the catalogue forbids · corrupt base64 — **and leaves the state empty, never half-loaded** | ✅ `build-document.test.js` [2] — except the self-member case, refused in code and exercised by no test |
| `createCatalog` / `createLevels` | a malformed manifest, 6 and 7 cases respectively | ✅ `catalog.test.js` [3], `levels.test.js` [2] |
| `model.js` | unknown segmentation or redundancy | ❌ |
| `physical.js` | `roles.sink.capability` missing from the manifest | ❌ (checked against the real data, never as a refusal) |

### The ones that should stay silent

Most of the list above is **true of the formalism, not of RAID**: an output port is not
an input, a component is not wired to itself, a node id does not exist. A player who
tries to connect a disk to a disk does not need a lesson — the canvas not drawing the
wire *is* the lesson, and it is understood on sight.

**Decision: these stay mute.** Explaining them would train the player to read messages
that carry nothing, which makes the messages that do carry something easier to ignore.

The reasons keep their value for developers and tests, which is what they were written
for.

## 2. It does not offer — silent absences

Nothing happens, and nothing is said, because there is nothing to say no *to*.

| where | what disappears | why | told? |
|---|---|---|---|
| `_axisOptions('algorithm', …)` | the algorithm slot itself | an array with parity gets the four rotations, a flat mirror the three mdadm layouts, **anything else gets an empty list and no slot** | ✅ since 2026-09-05 — the slot stays, disabled, with the class's own one-line reason from `data/raid-levels/*.yaml` |

Tracked as [`tech-debt/algorithm-slot-vanishes-silently.md`](../tech-debt/algorithm-slot-vanishes-silently.md) (resolved).

One row, and it was the most important row in this document. A linear mirror has no
algorithm to choose, which is correct — but the player used to see a slot that was there
a moment ago and now gone, with no way to learn that the disappearance was the answer
to a question they did not know they had asked. The slot now stays, disabled, and says
so.

Note how close this is to a refusal the game *does* explain. "This algorithm does not
belong here" is said out loud when the cause is the operating system
(`cross-axis-near-far-offset`, mechanism 3) and swallowed when the cause is the array's
class. **The same lesson, told in one case and hidden in the other** — nobody decided
that; it accumulated.

## 3. It accepts and explains — the validator

Seven rules, all in the declarative registry in `validator.js`. Each states its identity,
severity, layer and source once; `validate` stamps them on, so a rule cannot disagree
with its own registration.

| code | severity | what it teaches |
|---|---|---|
| `min-disks` | hard | a level has a minimum, read from the level's own file |
| `cross-axis-near-far-offset` | hard | near/far/offset are mdadm layouts — they exist only under Linux software RAID |
| `nvme-backplane` | hard | NVMe talks straight to PCIe; it bypasses the backplane |
| `engine-single-point` | hard | the RAID engine sits at exactly one point on the path |
| `mixed-disk-sizes` | soft | mirror and parity coerce every member down to the smallest; RAID 0 and linear do not |
| `uneven-spans` | soft | a mirror parent keeps one copy's worth; a striped parent runs slower over its tail |
| `backplane-diversity` | soft | members of a span should sit on different backplanes — **registered, but dormant**: v1 has a single backplane, so the check returns nothing (§9.4, deferred) |

Six of these are live, and they are the part of the game that works: the messages name
their subject, cite their source, and carry the real reason. The seventh,
`backplane-diversity`, is written into the registry so the §6 rule is visible and wired,
but it cannot fire until the model has more than one backplane.

### Is anything missing from §6?

The domain-model spec §6 lists the constraint vocabulary. Compared against the seven
rules:

- **Implemented**: minimums, NVMe/backplane, near/far/offset, engine single point, and
  two soft rules (mixed disk sizes, uneven spans). Every constraint the current model can
  express.
- **Registered but unable to fire**: backplane diversity — the rule exists so the
  vocabulary is complete; the model has nothing for it to check yet.
- **Deliberately deferred**: hot-spare capacity — it belongs to the runtime module
  (roadmap item 7).
- **Superseded and marked as such**: the even-disk mirror rule (RAID 1E made it false),
  and the reading of the engine's *position* as its type (ADR-001). Spec §6 had struck the
  whole "exactly one point on the path" row for that, while the count half of it —
  `engine-single-point`, more than one engine is a violation — was never superseded and is
  still live. The row now says so.
- **Out of the model's reach — two of them**:

  | constraint | source | why there is no rule |
  |---|---|---|
  | a partial Virtual Drive must cover *all* disks of the group | `terminologia.md` | — |
  | nesting with RAID 0 requires the span be fully virtualized | `nested-raids.md` | — |

  Both are about the **Virtual Drive**, and the game has no Virtual Drive. Spec §8 locks
  a four-level vocabulary — physical disks → drive group → span → VD — and the model
  implements three, stopping at the span. There is no way to violate these rules because
  there is no object to violate them on.

  They are not oversights and not debt. They are constraints waiting for a level of the
  model that does not exist yet. (The apparent conflict with "a span is a *subset* of a
  drive group, so 3-of-4 is allowed" dissolves once the two are read at their own levels:
  a span divides the **disks**, a VD divides the **capacity**.)

- **Promised in the data and never written**: `os-linux.yaml` states that without a
  battery-backed cache or a UPS a power loss during a write can leave the array
  inconsistent, and adds *"this is a soft constraint surfaced as a warning in the game."*
  There is no such rule. That is the **write hole**, and it is the reason a hardware
  controller has protected cache at all — see `unspoken-content.md`.

## The gap between "valid" and valid

The animate button turns on when a placement can be computed. It does not look at
violations. And the status bar's "valid" is `firstIssue`, which only reports structural
incompleteness — arrays with fewer than two members, empty slots. Once a build compiles,
`firstIssue` is `null` **always**.

So today the sandbox can say:

> ✓ build valid — click ▶ to animate the write

while the panel underneath lists a hard violation. The two statements are on the same
screen and contradict each other.

Tracked as [`tech-debt/build-valid-claimed-with-hard-violations.md`](../tech-debt/build-valid-claimed-with-hard-violations.md).

**Decision (2026-09-04): the animation is the reward, and the reward waits.** While a
hard violation stands, the animate button stays disabled and the status line does not
claim the build is valid. The mistake stays fully explorable and fully explained — what
it does not do is get rewarded.

Soft violations do not gate anything: they describe builds that are real and buildable,
merely suboptimal, and refusing to animate them would call them wrong.

This settles the open decision at the end of spec §6, marked *"Confirm."* since
2026-06 — and settles it slightly differently from how it was posed. Prompt mode blocks
step by step; the sandbox allows the mistake, explains it, and withholds the payoff.

## What is missing

Everything actionable found here is tracked as tech debt; this map stays the map.

> **Correction, 2026-09-04.** This census originally listed three untested refusals. One
> of them — `cpCanConnect` with no catalogue — **was already tested**, and had been since
> 2026-09-02 (`canvas-state.test.js` [13d], *"without a catalogue nothing can be wired,
> and it says so"*). The census missed it by grepping the tests for the refusal's *message
> string* (`no catalogue loaded`) while the test asserts only `/catalogue/`.
>
> Worth remembering when auditing coverage: **searching for the message finds the wording,
> not the behaviour.** A refusal is covered when something exercises the path, whatever the
> assertion happens to spell.
>
> **Second correction, same day.** The seven-rule table counted `backplane-diversity` as a
> rule that works. It is registered and dormant: its check returns nothing, by design, until
> the model has more than one backplane. Reading the registry measured the vocabulary, not
> the behaviour — the same mistake as above, from the other side.

| gap | tracked as |
|---|---|
| ~~three~~ **two** refusals with no test (`model.js` on an unknown segmentation or redundancy, `physical.js` on a manifest with no `roles.sink.capability`) — **closed 2026-09-04** | [`refusal-tests-missing.md`](../tech-debt/refusal-tests-missing.md) |
| the algorithm slot's silent absence — **closed 2026-09-05** | [`algorithm-slot-vanishes-silently.md`](../tech-debt/algorithm-slot-vanishes-silently.md) |
| "✓ build valid" alongside a hard violation, and the animation gate | [`build-valid-claimed-with-hard-violations.md`](../tech-debt/build-valid-claimed-with-hard-violations.md) |
| the drag path accepting an algorithm the picker would filter | [`algorithm-drop-ignores-class.md`](../tech-debt/algorithm-drop-ignores-class.md) (already open) |
| the power-loss warning §6 never got | [`power-loss-warning-promised-not-implemented.md`](../tech-debt/power-loss-warning-promised-not-implemented.md) |
