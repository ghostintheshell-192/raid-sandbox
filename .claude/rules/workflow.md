# Git Workflow and Development Commands

## Branch Strategy

- **main**: Production. Vercel deploys automatically from `main` to raid-sandbox.dev.
- **feature/**: New features (e.g., `feature/mobile-inline-picker`)
- **fix/**: Bug fixes (e.g., `fix/nested-write-order`)
- **refactor/**: Refactoring (e.g., `refactor/validator-registry`)

Before non-trivial work (refactor, multi-file change, migration), create a dedicated
branch. The branch name is a signal: `feature/X` means "work on X, nothing else."

## Development Workflow

### Starting new work

```bash
git checkout main && git pull origin main
git checkout -b feature/descriptive-name
```

### Committing

Commit frequently with clear messages. Type prefixes: `feat`, `fix`, `docs`,
`refactor`, `test`, `chore`.

```
feat: invert the mobile build flow to a per-slot picker

- tap an empty slot to reveal the piece types that fit its axis
- reuse the existing dataset.axis / drop-handler filtering
- keeps drag-and-drop as the desktop path

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

### Deploy

Push to `main` → Vercel builds and publishes to raid-sandbox.dev automatically. There is
no build step (static site); Vercel just serves the files.

## Testing

- Headless suites: `node tests/<file>.test.js` — **run one at a time** (each is standalone).
- Browser test pages: `tests/*.test.html` (open in a browser); demos likewise.
- Layout ground truth is hand-derived from the Linux `md` source — never regenerate
  golden tables from the engine (see `principles.md` / the golden-tables discipline).

Valentina runs verification herself. When changes warrant it, flag *what* to check
rather than running the suite proactively.

## Session Handoffs

At end of session, use `/handoff` to write a note in
`.memory-bank/projects/raid-explorer/`. Handoffs are local (gitignored); only
`.memory-bank/ideas/` is tracked.
