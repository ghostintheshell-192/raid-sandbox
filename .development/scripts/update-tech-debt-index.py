#!/usr/bin/env python3
"""
Update the tech-debt README.md with an auto-generated index of issues.
Reads frontmatter (priority, status) from each issue file and generates
the "Current Issues by Priority" section.

Usage:
    python update-tech-debt-index.py

Run from anywhere - paths are relative to script location.
"""

import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Configuration
SCRIPT_DIR = Path(__file__).parent
TECH_DEBT_DIR = SCRIPT_DIR.parent / "tech-debt"
README_FILE = TECH_DEBT_DIR / "README.md"

# Files to exclude
EXCLUDE_FILES = {"README.md", "_TEMPLATE.md"}

# Priority order for display
PRIORITY_ORDER = ["high", "medium", "low"]


def parse_frontmatter(content: str) -> Dict[str, str]:
    """Extract YAML frontmatter from markdown content."""
    frontmatter = {}

    if not content.startswith("---"):
        return frontmatter

    # Find closing ---
    end_match = re.search(r'\n---\n', content[3:])
    if not end_match:
        return frontmatter

    yaml_content = content[4:end_match.start() + 4]

    for line in yaml_content.strip().split('\n'):
        if ':' in line:
            key, value = line.split(':', 1)
            key = key.strip()
            value = value.strip()
            # Remove quotes if present
            if value.startswith('"') and value.endswith('"'):
                value = value[1:-1]
            elif value.startswith("'") and value.endswith("'"):
                value = value[1:-1]
            frontmatter[key] = value

    return frontmatter


def extract_title(content: str) -> str:
    """Extract the first H1 title from markdown content."""
    # Skip frontmatter
    if content.startswith("---"):
        end_match = re.search(r'\n---\n', content[3:])
        if end_match:
            content = content[end_match.end() + 4:]

    # Find first # Title
    match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return "Untitled"


def scan_issues() -> List[Dict]:
    """Scan tech-debt folder and return list of issue info."""
    issues = []

    for file_path in TECH_DEBT_DIR.glob("*.md"):
        if file_path.name in EXCLUDE_FILES:
            continue

        content = file_path.read_text(encoding='utf-8')
        frontmatter = parse_frontmatter(content)
        title = extract_title(content)

        issues.append({
            'filename': file_path.name,
            'title': title,
            'priority': frontmatter.get('priority', 'low'),
            'status': frontmatter.get('status', 'open'),
            'type': frontmatter.get('type', 'unknown'),
            'discovered': frontmatter.get('discovered', ''),
        })

    return issues


def generate_index_section(issues: List[Dict]) -> str:
    """Generate the markdown section for current issues by priority."""
    # No generated-at stamp: this section is a map of what is open, and git
    # already records when it last changed. Stamping the clock here made the
    # output differ on every run for no reason, which is what forced the
    # rewrite-only-on-change guard below and, elsewhere, the decision to stop
    # tracking this file at all.
    lines = [
        "## Current Issues by Priority",
        "",
    ]

    # Group by priority
    by_priority: Dict[str, List[Dict]] = {p: [] for p in PRIORITY_ORDER}
    for issue in issues:
        priority = issue['priority'].lower()
        if priority in by_priority:
            by_priority[priority].append(issue)
        else:
            by_priority['low'].append(issue)

    # Sort within each priority by filename
    for priority in by_priority:
        by_priority[priority].sort(key=lambda x: x['filename'])

    # Generate sections
    for priority in PRIORITY_ORDER:
        priority_issues = by_priority[priority]
        label = priority.capitalize()

        if not priority_issues:
            lines.append(f"**{label} Priority:** None currently")
        else:
            lines.append(f"**{label} Priority:**")
            for issue in priority_issues:
                # Format: - `filename.md` - Title
                lines.append(f"- `{issue['filename']}` - {issue['title']}")

        lines.append("")

    return '\n'.join(lines)


def update_readme(new_section: str) -> str:
    """Update README.md with the new index section.

    Returns "written", "unchanged", or "failed" — the caller reports which.
    Collapsing the first two into one message made the script claim it had
    updated a file it had deliberately left alone.
    """
    if not README_FILE.exists():
        print(f"ERROR: README not found at {README_FILE}")
        return "failed"

    content = README_FILE.read_text(encoding='utf-8')

    # Find the section to replace
    # Pattern: from "## Current Issues by Priority" to next "## " or end
    pattern = r'## Current Issues by Priority.*?(?=\n## [^#]|\Z)'

    if re.search(pattern, content, re.DOTALL):
        # Lambda replacement: issue titles may contain backslashes (e.g. \s in a
        # regex-related title), which re.sub would parse as escape sequences.
        new_content = re.sub(
            pattern, lambda _: new_section.rstrip() + '\n', content, flags=re.DOTALL
        )
    else:
        # Section not found - append before ## Integration
        integration_match = re.search(r'\n## Integration', content)
        if integration_match:
            insert_pos = integration_match.start()
            new_content = content[:insert_pos] + '\n' + new_section + '\n' + content[insert_pos:]
        else:
            # Just append at end
            new_content = content.rstrip() + '\n\n' + new_section

    # Write only on real change. With the stamp gone this is no longer a
    # workaround for self-inflicted churn — identical issues now genuinely
    # produce identical bytes — but it still spares the file a pointless
    # rewrite on every commit.
    if content == new_content:
        return "unchanged"

    README_FILE.write_text(new_content, encoding='utf-8')
    return "written"


def main():
    """Main entry point."""
    print(f"Scanning {TECH_DEBT_DIR}...")

    issues = scan_issues()
    print(f"Found {len(issues)} issues")

    # Count by priority
    by_priority = {}
    for issue in issues:
        p = issue['priority']
        by_priority[p] = by_priority.get(p, 0) + 1

    for p in PRIORITY_ORDER:
        count = by_priority.get(p, 0)
        if count > 0:
            print(f"  {p.capitalize()}: {count}")

    new_section = generate_index_section(issues)

    outcome = update_readme(new_section)
    if outcome == "failed":
        print("Failed to update README")
        return 1

    print(f"{'Updated' if outcome == 'written' else 'Unchanged'} {README_FILE}")
    return 0


if __name__ == "__main__":
    exit(main())
