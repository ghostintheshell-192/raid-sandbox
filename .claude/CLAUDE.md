# RAID Sandbox - Claude Code Project Configuration

This project uses Claude Code's official `.claude/rules/` pattern. All `.md` files in the `rules/` directory are automatically loaded as project instructions.

## Project Overview

**RAID Sandbox** — an interactive, browser-based learning game for RAID storage
concepts. Drag physical components onto a canvas, build arrays, and see the layouts
animate. Zero-dependency vanilla HTML/CSS/JS with YAML data files. Lives at
[raid-sandbox.dev](https://raid-sandbox.dev) (Vercel).

## Project Rules

The following rules are automatically loaded from `.claude/rules/`:

- **overview.md** - Project overview, methodology, and tech stack
- **coding-standards.md** - Coding standards and conventions
- **principles.md** - General development principles
- **preflight-checks.md** - Pre-flight checks before coding
- **workflow.md** - Git workflow and development process
- **idea-capture.md** - Convention for parking tangential ideas in `.memory-bank/ideas/`

## Documentation Structure

- **[.development/](.development/)** - Operational documentation
  - **[CURRENT-STATUS.md](.development/CURRENT-STATUS.md)** - Project state
  - `specs/` - Feature specifications (design backbone)
  - `tech-debt/` - Known issues
  - `scripts/` - Project scripts (session archiving, etc.)
- **[.memory-bank/](.memory-bank/)** - Session handoffs (local) + tracked `ideas/`
- **[.personal/](.personal/)** - Personal notes (not tracked)

---

*All rules are automatically loaded by Claude Code. No @includes needed.*
