# .development

Operational documentation for RAID Sandbox — tracked, lives with the code.

## Structure

- **[CURRENT-STATUS.md](CURRENT-STATUS.md)** — project state, milestones, task list
- **`specs/`** — feature specifications (the design backbone)
  - `implemented/raid-sandbox-domain-model.md` — the blueprint the YAML data and engine derive from
- **`tech-debt/`** — known issues, one file per item (see its `README.md` + `_TEMPLATE.md`)
- **`scripts/`** — project scripts
  - `session-archive.py` — archives session transcripts to `.memory-bank/sessions/`
    (invoked by the `SessionEnd` hook in `.claude/settings.json`)

## Related

- Session handoffs (per-session continuity notes) live in
  `.memory-bank/projects/raid-explorer/` — local, gitignored.
- Tracked idea seeds live in `.memory-bank/ideas/`.
