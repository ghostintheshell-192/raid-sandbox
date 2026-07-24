---
name: session-handoff
description: Use when ending a session, switching projects, before /exit or /clear, or when the user asks for a summary of what was done. Also activate when the user says goodbye or requests a handoff/summary in their native language.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Session Handoff

When this skill is activated, create handoff notes for the current session.

## What to do

### 1. Create a new handoff file

**Location**: `.memory-bank/` (flat — no per-project subfolder)

Each session gets its own file. Create a new file with this naming convention:

**Filename format**: `YYYY-MM-DD-HHmm-brief-title-slug.md`

- `YYYY-MM-DD` = today's date
- `HHmm` = current time (24h format, no colon for filesystem compatibility)
- `brief-title-slug` = lowercase, hyphen-separated summary (max 50 chars)

**Examples**:

- `2026-07-24-2135-mobile-tap-to-build-ci-branch-protection.md`
- `2026-06-14-1744-combinations-done-phase2-validator-next.md`

### 2. File content structure

```markdown
## YYYY-MM-DD - Brief title

**Done**:
- What was completed
- Important files modified
- Decisions made

**Next**:
- Suggested next steps, in priority order
- Blockers identified

**Notes**:
- Useful context for next session
- Gotchas to remember
```

**Next** carries the remaining work **in priority order** — that ordering is the
part the next session cannot reconstruct from `MEMORY.md` or the git log, so it
is the most valuable thing in the file. If a task has a caveat ("ask before
touching X"), it belongs here too.

**If this session did not advance the project's task list** — config, tooling,
documentation or scaffold work — say so explicitly at the top and **link the
most recent handoff that does carry it**, instructing the next session to read
that one as well. Otherwise the next session reads "we updated the config" and
has no idea what the project is actually working on. Do not copy the list
across: link it, so there is one authority and it cannot go stale.

If the session touched branches or merges, record branch names and commit
hashes in **Notes** so git state can be resumed without hunting.

### 3. Content guidelines

- Write content in the **user's preferred language** (check user profile or recent messages)
- Keep field names in English (Done/Next/Notes) for consistency
- Max 5-7 bullet points per section
- Include specific file paths when relevant
- Be concise but complete

### 4. Confirm to the user

After creating the file, confirm:

- Which handoff file was created
- The filename used
- Remind the user to type `/exit` or `/clear` to complete

## Example

1. Create `.memory-bank/2026-07-24-2135-mobile-tap-to-build-ci-branch-protection.md`
2. Confirm: "Created handoff notes: `2026-07-24-2135-mobile-tap-to-build-ci-branch-protection.md`. You can exit with /exit."

## Reading previous sessions

At the start of a new session (see `.claude/rules/workflow.md`, *Session Start*):

1. List files in `.memory-bank/`
2. Read the most recent handoff (sorted by filename = sorted by date)
3. Read any files it links to

## Localized triggers

This skill should also activate when the user expresses intent to end the session or requests a summary **in their native language**. Common patterns include:

- "I'm about to leave" / "I'm done for today"
- "Give me a summary" / "What did we do?"
- "Let's wrap up" / "Closing the session"
- Saying goodbye in any form

Recognize these phrases in whatever language the user speaks.
