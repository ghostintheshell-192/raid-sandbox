# Tech Debt Issues

This folder contains individual technical debt issues for DevDash.

## Structure

Each issue is a separate markdown file with standardized frontmatter:

```yaml
---
type: [bug|feature|refactor|performance|testing|code-quality|security]
priority: [high|medium|low]
status: [open|in-progress|resolved|closed|rejected]
discovered: YYYY-MM-DD
related: []  # List of related issue filenames
related_decision: null  # Optional: link to reference/decisions/NNN-name.md
report: null  # Optional: link to archive/analysis/YYYY-MM-DD_report_agent-name.md
---
```

## Workflow

### Creating New Issues

1. Copy `_TEMPLATE.md`
2. Rename to descriptive slug: `issue-name.md` (NO DATE PREFIX)
3. Fill in frontmatter and content
4. Status starts as `open`

### Working on Issues

1. Update status to `in-progress`
2. Work on fix/implementation
3. When complete, add resolution sections:
   - Solution Implemented
   - Testing
   - Impact

### Archiving Completed Issues

**Automatic** (recommended):

1. Change status to `resolved`, `closed`, or `rejected` in frontmatter
2. Run: `../scripts/archive-resolved-issues.sh`
3. Script automatically moves to `archive/completed/` with date prefix

**Manual**:

1. Add date prefix: `YYYY-MM-DD_issue-name.md`
2. Move to `../archive/completed/`
3. Delete from `tech-debt/`

## Current Issues by Priority

*Auto-updated: 2026-06-28 23:59*

**High Priority:**
- `imgui-backend-shutdown-order.md` - ImGui assertion on exit: backend non spento prima di DestroyContext

**Medium Priority:**
- `line-level-promote.md` - Promote e Apply operano solo sull'intero file
- `non-markdown-files-rendered-as-markdown.md` - File non-Markdown renderizzati come Markdown (script, config)

**Low Priority:**
- `markdown-code-block-styling.md` - Fenced code blocks rendered as flat yellow text — no syntax highlighting
- `preprocess-imports-indented-fences.md` - PreprocessImports does not recognise indented fenced code blocks
- `scanner-directory-include-silent.md` - ConfigFileScanner: @include verso directory accettato e poi fallisce in silenzio
- `session-handoff-skill-note.md` - Current Working Notes

## Integration with Reference Documentation

### Linking to Architecture Decisions

If an issue relates to an architectural decision:

```yaml
---
related_decision: 001-stack-tecnologico.md
---
```

This helps understand context: "Why was this pattern chosen? What were the trade-offs?"

### Agent-Generated Issues

When agents (code-reviewer, security-auditor, etc.) find issues:

- Issue created automatically in `tech-debt/`
- Full report in `archive/analysis/YYYY-MM-DD_report_agent-name.md`
- Issue links to report via `report:` field

### Creating Architecture Decisions

If resolving an issue requires a significant architectural choice:

1. Document decision in `../reference/decisions/NNN-name.md`
2. Link from issue: `related_decision: NNN-name.md`
3. Update `.claude/key-decisions.md` if Impact ≥ high (auto-generated)

## Tips

- Use descriptive slugs for filenames
- Keep frontmatter up to date
- Link related issues in `related` field
- Link to architectural decisions in `related_decision` if applicable
- Date prefix ONLY when moving to archive (automatically handled by script)
- Check `_TEMPLATE.md` for structure
