# Pre-flight Checks

Before making code modifications, verify:

1. **Branch**: Never work directly on `main`. Create a task branch if needed —
   the branch name is a signal (`feature/X` means "work on X, nothing else").
2. **Uncommitted changes**: Note any pending changes before starting new work.
3. **Context**: `.development/CURRENT-STATUS.md` for project state, and the
   relevant spec in `.development/specs/` if the change touches the domain model.

**Skip when:**

- Read-only operations (exploring, reading, explaining code)
- Already on a task branch and continuing that work

> The latest handoff in `.memory-bank/` is read at **session start**, not here —
> see `workflow.md`.
