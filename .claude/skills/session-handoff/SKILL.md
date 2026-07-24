---
name: session-handoff
description: Use when ending a session, switching projects, before /exit or /clear, or when the user asks for a summary of what was done. Also activate when the user says goodbye or requests a handoff/summary in their native language.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Session Handoff

When this skill is activated, update the handoff notes for all projects you worked on during the session.

## What to do

### 1. Identify projects touched

Review the conversation and identify:
- Which projects had files created/edited
- Which projects were discussed substantially
- The current working directory (may be a project itself)

### 2. Create a handoff file for each project

**Location**: `.memory-bank/projects/<project-name>/`

**Filename**: `YYYY-MM-DD-HHmm-titolo-slug.md`

Create a new file for this session (one file per session, not appending to existing):

```markdown
## YYYY-MM-DD - Brief title

**Done**:
- What was completed
- Important files modified
- Decisions made

**Next**:
- Suggested next steps
- Blockers identified

**Notes**:
- Useful context for next session
- Gotchas to remember
```

### 3. Content language

- Write the content in the **user's preferred language** (check user profile or recent messages)
- Keep field names in English (Done/Next/Notes) for consistency and parseability
- Max 5-7 bullet points per section
- Include specific file names when relevant
- Don't repeat information already in previous entries

### 4. Confirm to the user

After updating, confirm:
- Which handoff files were updated
- Remind the user to type `/exit` or `/clear` to complete

## Example

If during the session you worked on `my-app` and `utils-lib`:

1. Create `.memory-bank/projects/my-app/2026-01-29-1030-feature-implementation.md`
2. Create `.memory-bank/projects/utils-lib/2026-01-29-1030-bug-fix.md`
3. Confirm: "Created handoff notes for my-app and utils-lib. You can exit with /exit."

## Multi-project sessions

If the user did `/clear` during the session to switch projects:
- Only update projects touched AFTER the last `/clear`
- Previous projects were already handled

## Localized triggers

This skill should also activate when the user expresses intent to end the session or requests a summary **in their native language**. Common patterns include:

- "I'm about to leave" / "I'm done for today"
- "Give me a summary" / "What did we do?"
- "Let's wrap up" / "Closing the session"
- Saying goodbye in any form

Recognize these phrases in whatever language the user speaks.
