# Git hooks

Project-level hooks, run by `pre-commit` in numeric order.

**They are not active until you enable them**, once per clone:

```bash
bash .development/automation/bootstrap.sh
```

Git will not pick up hooks shipped inside a repository on its own — that is a
security property, not an oversight. `bootstrap.sh` sets
`core.hooksPath .githooks` locally and makes everything executable.

## Modules

| Module | What it does | Blocks? |
| ------ | ------------ | ------- |
| `00-branch-protection` | On `main`, allows doc-only commits (`*.md`, `.development/`) and merges; anything touching code needs a branch | yes |
| `01-security` | Scans staged files for secrets — by filename, by content pattern, by directory | yes |
| `04-docs-update` | Runs `.development/automation/docs-update.sh` and stages the regenerated docs | no |

Bypass with `git commit --no-verify` when a check is wrong. That is the escape
hatch a false positive is supposed to cost.

## Why the gaps in the numbering

These modules come from the shared dev-dash scaffold and **keep its numbers**,
so a module here can be diffed against its counterpart there without a mental
remapping. The missing slots are the ones this project deliberately does not
take:

- `02-format-check` — no formatter on a vanilla, no-build-step codebase
- `03-archive-resolved-issues` — the tech-debt volume does not justify it
- `05-spec-workflow` — one spec; the workflow it automates does not exist here

Same reasoning for `post-checkout` / `post-merge` (spec bookkeeping) and for
`build.sh` / `format-*.sh`: not carried over.

## Relationship to the remote gate

The hooks are the *local* half. The *remote* half is GitHub branch protection on
`main` plus the `headless` CI check, and the two are complementary:

- GitHub has `enforce_admins: false` on purpose, so the maintainer can land a doc
  fix directly. `00-branch-protection` is what keeps that door narrow — doc-only.
- CI runs `.development/automation/test.sh`, the same script you run locally.
