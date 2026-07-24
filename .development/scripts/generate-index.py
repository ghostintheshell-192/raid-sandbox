#!/usr/bin/env python3
"""
Generate INDEX.md for the development documentation.
Scans .development/ and docs/ folders and creates a navigable index.
"""

import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple

# Configuration
DEVELOPMENT_DIR = Path(__file__).parent.parent
PROJECT_ROOT = DEVELOPMENT_DIR.parent
DOCS_DIR = PROJECT_ROOT / "docs"
INDEX_FILE = DEVELOPMENT_DIR / "INDEX.md"
DAYS_RECENT = 7

# Marker of the generated-at line. Kept out of the change detection in main():
# see the comment there for why the file must not rewrite itself every run.
TIMESTAMP_PREFIX = "*Auto-generated:"

# Folders to exclude from indexing
EXCLUDE_FOLDERS = {
    "scripts",
    "__pycache__",
}

# Quick links - files to highlight at the top
# This project has no ADRs and no specs/README.md; specs are still listed in
# the per-directory scan below. Add entries here as those artifacts appear.
QUICK_LINKS = [
    ("Current Status", "CURRENT-STATUS.md"),
    ("Tech Debt", "tech-debt/README.md"),
]


def get_file_info(path: Path) -> Tuple[str, int, datetime]:
    """Get file name, size in KB, and modification time."""
    stat = path.stat()
    size_kb = stat.st_size // 1024
    mtime = datetime.fromtimestamp(stat.st_mtime)
    return path.name, size_kb, mtime


def scan_directory(base_dir: Path, relative_to: Path) -> Dict[str, List[dict]]:
    """Scan directory and return organized file info."""
    result = {}

    if not base_dir.exists():
        return result

    for item in sorted(base_dir.iterdir()):
        if item.name.startswith(".") or item.name in EXCLUDE_FOLDERS:
            continue

        rel_path = item.relative_to(relative_to)

        if item.is_file() and item.suffix == ".md":
            folder = str(rel_path.parent) if rel_path.parent != Path(".") else "root"
            if folder not in result:
                result[folder] = []
            name, size, mtime = get_file_info(item)
            result[folder].append({
                "name": name,
                "path": str(rel_path),
                "size_kb": size,
                "mtime": mtime,
            })
        elif item.is_dir():
            sub_result = scan_directory(item, relative_to)
            result.update(sub_result)

    return result


def recency_key(file_info: dict) -> tuple:
    """Sort key: most recent day first, then name.

    Deliberately coarse. Sorting by the raw mtime is precise to the second, but
    every entry is *rendered* only to the day ("today", "2d ago"), so a
    second-level tie-break produces reorderings the reader cannot account for.
    INDEX.md indexes itself, so writing it bumps its own mtime and the next run
    would shuffle the neighbouring entries — a diff on every commit with no
    change behind it. Day granularity plus the name makes the order total.
    """
    return (-file_info["mtime"].toordinal(), file_info["name"])


def format_file_entry(file_info: dict, now: datetime) -> str:
    """Format a single file entry with optional 'recent' marker."""
    days_ago = (now - file_info["mtime"]).days
    recent_marker = " **RECENT**" if days_ago <= DAYS_RECENT else ""
    date_str = file_info["mtime"].strftime("%Y-%m-%d")
    size_str = f"{file_info['size_kb']}KB" if file_info["size_kb"] > 0 else "<1KB"
    return f"- [{file_info['name']}]({file_info['path']}) ({size_str}, {date_str}){recent_marker}"


def generate_index() -> str:
    """Generate the complete INDEX.md content."""
    now = datetime.now()
    lines = []

    # Header
    lines.append("# INDEX - Development Documentation")
    lines.append("")
    lines.append(f"*Auto-generated: {now.strftime('%Y-%m-%d %H:%M')}*")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Quick Links
    lines.append("## Quick Links")
    lines.append("")
    for title, path in QUICK_LINKS:
        full_path = DEVELOPMENT_DIR / path
        if full_path.exists():
            lines.append(f"- [{title}]({path})")
        else:
            lines.append(f"- {title} *(file not found: {path})*")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Development Documentation (.development/)
    lines.append("## Development Documentation (.development/)")
    lines.append("")
    lines.append("*Specs, tech-debt, decisions*")
    lines.append("")

    dev_files = scan_directory(DEVELOPMENT_DIR, DEVELOPMENT_DIR)

    # Sort folders in a logical order
    folder_order = ["root", "specs", "tech-debt", "reference", "archive"]
    sorted_folders = sorted(
        dev_files.keys(),
        key=lambda x: (folder_order.index(x.split("/")[0]) if x.split("/")[0] in folder_order else 99, x)
    )

    for folder in sorted_folders:
        files = dev_files[folder]
        if not files:
            continue

        folder_display = folder if folder != "root" else "(root)"
        lines.append(f"### {folder_display}/ ({len(files)} files)")
        lines.append("")

        # Sort files by modification day (newest first), then by name
        files.sort(key=recency_key)

        for f in files:
            lines.append(format_file_entry(f, now))
        lines.append("")

    lines.append("---")
    lines.append("")

    # Public Documentation (docs/)
    lines.append("## Public Documentation (docs/)")
    lines.append("")
    lines.append("*Committed to git - user-facing documentation*")
    lines.append("")

    if DOCS_DIR.exists():
        docs_files = scan_directory(DOCS_DIR, PROJECT_ROOT)
        for folder in sorted(docs_files.keys()):
            files = docs_files[folder]
            if not files:
                continue
            lines.append(f"### {folder}/")
            lines.append("")
            for f in files:
                lines.append(format_file_entry(f, now))
            lines.append("")
    else:
        lines.append("*docs/ folder not found*")
        lines.append("")

    lines.append("---")
    lines.append("")

    # Recently Modified
    lines.append("## Recently Modified (last 7 days)")
    lines.append("")

    all_files = []
    for folder, files in dev_files.items():
        all_files.extend(files)

    recent_cutoff = now - timedelta(days=DAYS_RECENT)
    recent_files = [f for f in all_files if f["mtime"] > recent_cutoff]
    recent_files.sort(key=recency_key)

    if recent_files:
        for i, f in enumerate(recent_files[:10], 1):
            days = (now - f["mtime"]).days
            days_str = "today" if days == 0 else f"{days}d ago"
            lines.append(f"{i}. [{f['name']}]({f['path']}) ({days_str})")
    else:
        lines.append("*No files modified in the last 7 days*")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("*Run `python .development/scripts/generate-index.py` to regenerate*")

    return "\n".join(lines)


def strip_timestamp(text: str) -> str:
    """Drop the generated-at line so two runs can be compared for real change."""
    return "\n".join(
        line for line in text.splitlines() if not line.startswith(TIMESTAMP_PREFIX)
    )


def main():
    """Main entry point.

    Rewrites INDEX.md only when its substance changed. The timestamp alone is
    not substance: a pre-commit hook regenerates this file on every commit, and
    an unconditional write would attach a one-line diff to each of them —
    noise that trains the reader to stop looking at the diff.
    """
    content = generate_index()

    if INDEX_FILE.exists():
        current = INDEX_FILE.read_text(encoding="utf-8")
        if strip_timestamp(current) == strip_timestamp(content):
            print(f"Unchanged {INDEX_FILE}")
            return

    INDEX_FILE.write_text(content, encoding="utf-8")
    print(f"Generated {INDEX_FILE}")


if __name__ == "__main__":
    main()
