# Git Workflow and Development Commands

## Session Start

At the beginning of every session, before starting any work:

1. **Read the latest handoff** in `.memory-bank/` (the most recent `.md` file by
   date in the filename)
2. **Read any linked files** referenced in the handoff (specs, idea notes,
   related handoffs)
3. **Cross-reference** with `memory/MEMORY.md` for stable project facts

This is the continuity mechanism between sessions and it is not optional. The
handoffs are session diaries — what was done, why, what is next, in priority
order. `MEMORY.md` is a compact index of stable facts; it does **not** carry the
task ordering or the per-task caveats, so starting from it alone loses them.

## Branch Strategy

- **main**: Production. Vercel deploys automatically from `main` to raid-sandbox.dev.
- **feature/**: New features (e.g., `feature/mobile-inline-picker`)
- **fix/**: Bug fixes (e.g., `fix/nested-write-order`)
- **refactor/**: Refactoring (e.g., `refactor/validator-registry`)
- **docs/**: Documentation, notes, specs (e.g., `docs/informative-ui-map`)
- **chore/**: Tooling, config, hooks (e.g., `chore/strict-branch-protection`)

**Nothing is authored directly on `main` — documentation included.** Only merges land
there, and the `00-branch-protection` hook enforces it. The doc-only exemption was tried
and dropped (2026-07-25): the derived docs regenerate on every commit, so a doc commit on
`main` conflicts with any open branch's regenerated copies, forcing a merge, a new head
SHA and a fresh CI run. The friction outweighed the convenience.

Before any work, create a dedicated branch. The branch name is a signal: `feature/X`
means "work on X, nothing else."

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

### Pull Requests

**Merges go through GitHub, never locally.** The `headless` and `typecheck` workflows run
on pull requests and on pushes to `main`, so a local merge means CI was never a gate.

The flow: Claude commits on the branch → **Valentina pushes** → **Claude opens the PR**
(`gh pr create`) → Valentina checks CI and merges from GitHub.

**Keep the PR body short.** It is a summary of *what was done*, not an explanation of why —
the why is in the files the PR adds, and repeating it there means writing it twice and
letting the two drift. A few sentences or a short list.

The PR is asynchronous and permanent: it is what someone reads months later to find out
what changed. Anything meant for Valentina *now*, while she decides whether to approve,
belongs in the chat — a formatting choice, a small thing to look at, a question. If the
point is visible in the diff, it is not worth a line of prose.

`gh pr edit` currently fails on this repo with a GraphQL error about Projects (classic).
Use the REST API instead: `gh api repos/<owner>/<repo>/pulls/<n> -X PATCH -F body=@<file>`.

## Deploy

Push to `main` → Vercel builds and publishes to raid-sandbox.dev automatically. There is
no build step (static site); Vercel just serves the files.

## Testing

- Headless suites: `node tests/<file>.test.js` — **run one at a time** (each is standalone).
- Type check: `bash .development/automation/typecheck.sh` (npx-fetched TypeScript over
  `jsconfig.json`; the files that opt in carry `// @ts-check`, the shapes are JSDoc
  typedefs in `src/engine/types.js`). VS Code shows the same diagnostics inline.
- Browser test pages: `tests/*.test.html` (open in a browser); demos likewise.
- Layout ground truth is hand-derived from the Linux `md` source — never regenerate
  golden tables from the engine (see `principles.md` / the golden-tables discipline).

Valentina runs verification herself. When changes warrant it, flag *what* to check
rather than running the suite proactively.

## Session End

**Write a handoff note before ending any session.** This is non-negotiable: the
`.memory-bank/` diary is the primary continuity mechanism (see *Session Start*),
and skipping it breaks it for the next session.

When the user signals end of session — in any form, in any language — invoke the
`session-handoff` skill **before** replying farewell. Recognize "fermiamoci",
"è tardi", "chiudiamo", "continuiamo domani", "ciao", `/exit`, `/clear`,
explicit requests for a summary, and equivalent signals.

The handoff lives **flat** in `.memory-bank/`, named `YYYY-MM-DD-HHmm-<slug>.md`,
with a **NEXT** section carrying the remaining work in priority order. If the
session touched branches or merges, include branch names and commit hashes so
the next session can resume git state without hunting.

Do not rely on the `SessionEnd` hook in `.claude/settings.json` — that archives
the raw transcript to `.memory-bank/sessions/`, it does not produce a semantic
handoff.

Handoffs and session transcripts are local (gitignored); only
`.memory-bank/ideas/` is tracked.
