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
- **`tech-debt/`** — known issues, one file per item (`README.md` is auto-generated;
  start new items from `_TEMPLATE.md`)
- **`scripts/`** — project scripts
  - `generate-architecture.sh` (+ `extract-summary.sh`) — regenerates `ARCHITECTURE.md`
    from the source tree, reading each file's leading JSDoc block
  - `generate-index.py` — regenerates `INDEX.md`
  - `update-tech-debt-index.py` — regenerates `tech-debt/README.md`
  - `session-archive.py` — archives session transcripts to `.memory-bank/sessions/`

The first three run automatically at session start (`SessionStart` hook in
`.claude/settings.json`); `session-archive.py` runs at `SessionEnd`. All are
idempotent and safe to run by hand.

- **`reference/`** — durable reference documentation
  - `decisions/` — ADRs (`NNN-name.md`). **Empty: no ADRs recorded yet.** Start
    from `001` when one is earned; `ARCHITECTURE.md` grows a "Key Decisions"
    section automatically. Never import another project's ADRs — see
    `.claude/CLAUDE.md`.
  - `technical/` — technical notes

## Related

- Session handoffs (per-session continuity notes) live **flat** in
  `.memory-bank/` — local, gitignored. They are read at session start; see
  `.claude/rules/workflow.md`.
- Tracked idea seeds live in `.memory-bank/ideas/`.
