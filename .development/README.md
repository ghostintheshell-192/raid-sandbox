# .development

Operational documentation for RAID Sandbox — tracked, lives with the code.

## Structure

- **[CURRENT-STATUS.md](CURRENT-STATUS.md)** — project state, milestones, task list
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — layer overview + module tree *(auto-generated)*.
  Imported into every Claude session by `.claude/CLAUDE.md`, so it is the
  navigation map: read it before exploring source.
- **[INDEX.md](INDEX.md)** — navigation over this folder *(auto-generated)*
- **`specs/`** — feature specifications (the design backbone)
  - `implemented/raid-sandbox-domain-model.md` — the blueprint the YAML data and engine derive from
  - `implemented/agnostic-engine.md` — the engine that names no component and no level in code
  - `implemented/degenerate-levels.md` — a level below its minimum collapses into a simpler one
  - `implemented/knowledge-base.md` — the knowledge base generated from the data
  - `planned/derived-controller.md` — the verdict drawn as a box (partly implemented)
  - `planned/informative-ui.md` — the inventory of what the interface should explain
- **`tech-debt/`** — known issues, one file per item (`README.md` is auto-generated;
  start new items from `_TEMPLATE.md`)

> **The derived docs are tracked.** `ARCHITECTURE.md`, `INDEX.md` and
> `tech-debt/README.md` regenerate on every commit (`04-docs-update` in
> `.githooks/pre-commit.d/`) and at session start. Their generators are
> deterministic — no clock, no mtimes — so the same sources give the same bytes and
> two branches do not diverge on them. `INDEX.md` and `tech-debt/README.md` were
> gitignored until 2026-08-29, when they still carried a timestamp; the note in
> `.gitignore` records why that changed.
- **`scripts/`** — project scripts
  - `generate-architecture.sh` (+ `extract-summary.sh`) — regenerates `ARCHITECTURE.md`
    from the source tree, reading each file's leading JSDoc block
  - `generate-index.py` — regenerates `INDEX.md`
  - `update-tech-debt-index.py` — regenerates `tech-debt/README.md`
  - `generate-kb.js` (+ `lib/kb-markdown.js`, `lib/capacity-template.js`) —
    generates the knowledge base: the static pages in `kb/` and `sitemap.xml`, from
    `data/kb/` and the `kb:` blocks of the level files
  - `session-archive.py` — archives session transcripts to `.memory-bank/sessions/`

The four generators run automatically at session start (`SessionStart` hook in
`.claude/settings.json`) and on every commit (the pre-commit hook);
`session-archive.py` runs at `SessionEnd`. All are idempotent and safe to run by
hand.

- **`automation/`** — scripts run by hand or by the hooks
  - `test.sh` — runs every headless suite in `tests/`
  - `typecheck.sh` — the TypeScript check over the files that opt in with `// @ts-check`
  - `docs-update.sh` — runs the four generators; the single place that knows the list
  - `bootstrap.sh` — sets up a fresh clone (hooks path, merge driver)

- **`reference/`** — durable reference documentation
  - `decisions/` — ADRs (`NNN-name.md`), 001 to 004 so far; `ARCHITECTURE.md` lists
    them in its "Key Decisions" section automatically. Never import another
    project's ADRs — see `.claude/CLAUDE.md`.
  - `golden-tables/` — the placement tables derived by hand from the Linux `md`
    source; the layout suite asserts the engine against them
  - `adr-001-hardware-claims-sources.md` — the reading list for ADR-001's hardware claims
  - `engine-robustness-and-extraction.md` — the engine audit and the extraction map
  - `physical-model-fidelity.md`, `refusal-points.md`, `unspoken-content.md` —
    censuses of the model against the real hardware, of where the game refuses, and
    of what it computes but does not say

## Related

- Session handoffs (per-session continuity notes) live **flat** in
  `.memory-bank/` — local, gitignored. They are read at session start; see
  `.claude/rules/workflow.md`.
- Tracked idea seeds live in `.memory-bank/ideas/`.
