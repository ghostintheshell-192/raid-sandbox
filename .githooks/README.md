# Git hooks

Project-level hooks, run by `pre-commit` in numeric order.

**They are not active until you enable them**, once per clone:

```bash
bash .development/automation/bootstrap.sh
```

Git will not pick up hooks shipped inside a repository on its own — that is a
security property, not an oversight. `bootstrap.sh` sets
`core.hooksPath .githooks` locally, registers the `merge=generated` driver the
derived docs are marked with in `.gitattributes`, and makes everything executable.

## Modules

| Module | What it does | Blocks? |
| ------ | ------------ | ------- |
| `00-branch-protection` | On `main`, allows **merges only**; everything else — documentation included — needs a branch | yes |
| `01-security` | Scans staged files for secrets — by filename, by content pattern, by directory | yes |
| `04-docs-update` | Runs `.development/automation/docs-update.sh` and stages the regenerated docs and knowledge base | no |

Bypass with `git commit --no-verify` when a check is wrong. That is the escape
hatch a false positive is supposed to cost.

## post-merge

`post-merge` runs after a merge, including the one `git pull` makes. It calls
`04-docs-update` against the merged tree, because git creates a merge commit
without conflicts without running `pre-commit`, so the derived docs would
otherwise describe neither branch. What it regenerates is staged, not committed.
Its second step, moving a merged branch's spec to `implemented/`, runs only if
`.development/scripts/spec-workflow.py` exists; in this project it does not, so
that step is inert.

## Why the gaps in the numbering

These modules come from the shared dev-dash scaffold and **keep its numbers**,
so a module here can be diffed against its counterpart there without a mental
remapping. The missing slots are the ones this project deliberately does not
take:

- `02-format-check` — no formatter on a vanilla, no-build-step codebase
- `03-archive-resolved-issues` — the tech-debt volume does not justify it
- `05-spec-workflow` — specs move from `planned/` to `implemented/` by hand; the
  workflow it automates does not exist here

Same reasoning for `post-checkout` and for `build.sh` / `format-*.sh`: not
carried over.

## Relationship to the remote gate

The hooks are the *local* half. The *remote* half is GitHub branch protection on
`main` plus the `headless` CI check, and the two are complementary:

- GitHub has `enforce_admins: false`, which leaves the maintainer *able* to commit
  straight to `main`. `00-branch-protection` is what makes sure they don't: locally,
  only merges land on `main`. The remote setting stays permissive so a genuine
  emergency (or a stuck required check, as on 2026-07-25) can still be resolved —
  it is an escape hatch, not the daily path.
- CI runs `.development/automation/test.sh`, the same script you run locally.
