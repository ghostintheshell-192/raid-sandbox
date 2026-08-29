#!/usr/bin/env python3
"""
Generate INDEX.md for the development documentation.

INDEX.md is a *map*, not a history. It answers "what documents exist and what
is each one for", and nothing else. Anything about when a file changed, how
recently, or in what order things moved belongs to git, which records it
better: with the reason, the author, and in a form that survives a clone.

That distinction is what makes this generator deterministic. It reads only
paths and file contents — never mtimes, never the clock — so the same tree
produces the same bytes on any machine, in any checkout, at any time. Which is
in turn why INDEX.md can be tracked in git without generating a diff on every
commit.
"""

from pathlib import Path
from typing import Dict, List

# Configuration
DEVELOPMENT_DIR = Path(__file__).parent.parent
PROJECT_ROOT = DEVELOPMENT_DIR.parent
DOCS_DIR = PROJECT_ROOT / "docs"
INDEX_FILE = DEVELOPMENT_DIR / "INDEX.md"

# How far into a file to look for its H1 before giving up.
TITLE_SEARCH_LINES = 40

# Folders to exclude from indexing
EXCLUDE_FOLDERS = {
    "scripts",
    "__pycache__",
}

# Quick links - files to highlight at the top
# Neither specs/ nor reference/decisions/ carries a README index in this project,
# so linking to one would render as "file not found". ADR-001 exists; specs and
# decisions are still reached through the per-directory scan below. Add entries
# here if those index pages ever appear.
QUICK_LINKS = [
    ("Current Status", "CURRENT-STATUS.md"),
    ("Tech Debt", "tech-debt/README.md"),
]


def read_title(path: Path) -> str:
    """First H1 of the document, or "" if it has none.

    This is the annotation that earns the index its keep: a bare list of
    filenames is a worse `ls`, while "006-headless-browser-scraping.md —
    Headless Browser for Anti-Bot Protected Sources" says something the
    filename cannot. Frontmatter is skipped implicitly by scanning for the
    first "# " line rather than the first line.
    """
    try:
        with path.open(encoding="utf-8") as fh:
            for _, line in zip(range(TITLE_SEARCH_LINES), fh):
                if line.startswith("# "):
                    return line[2:].strip()
    except OSError:
        pass
    return ""


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
            # as_posix() keeps forward slashes on Windows too: these strings end up
            # as markdown link targets, and backslashes break them everywhere.
            folder = rel_path.parent.as_posix() if rel_path.parent != Path(".") else "root"
            if folder not in result:
                result[folder] = []
            result[folder].append({
                "name": item.name,
                "path": rel_path.as_posix(),
                "title": read_title(item),
            })
        elif item.is_dir():
            sub_result = scan_directory(item, relative_to)
            result.update(sub_result)

    return result


def format_file_entry(file_info: dict, prefix: str = "") -> str:
    """Format a single file entry: filename as the link, H1 as the annotation.

    `prefix` is prepended to the link target for sections whose paths are
    relative to the project root rather than to INDEX.md's own directory.
    """
    link = f"{prefix}{file_info['path']}"
    entry = f"- [{file_info['name']}]({link})"
    if file_info["title"]:
        entry += f" — {file_info['title']}"
    return entry


def generate_index() -> str:
    """Generate the complete INDEX.md content."""
    lines = []

    # Header
    lines.append("# INDEX - Development Documentation")
    lines.append("")
    lines.append("*A map of what exists and what each document is for.*")
    lines.append("*For when and why something changed, ask git.*")
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

        # Alphabetical: in a map you scan for a name, not for a date.
        files.sort(key=lambda f: f["name"])

        for f in files:
            lines.append(format_file_entry(f))
        lines.append("")

    lines.append("---")
    lines.append("")

    # Public Documentation (docs/)
    lines.append("## Public Documentation (docs/)")
    lines.append("")
    lines.append("*Committed to git - user-facing documentation*")
    lines.append("")

    if DOCS_DIR.exists():
        # These paths are relative to the project root, but INDEX.md sits in
        # .development/ — hence the "../" so the links resolve from there.
        docs_files = scan_directory(DOCS_DIR, PROJECT_ROOT)
        for folder in sorted(docs_files.keys()):
            files = docs_files[folder]
            if not files:
                continue
            lines.append(f"### {folder}/")
            lines.append("")
            files.sort(key=lambda f: f["name"])
            for f in files:
                lines.append(format_file_entry(f, prefix="../"))
            lines.append("")
    else:
        lines.append("*docs/ folder not found*")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("*Run `python .development/scripts/generate-index.py` to regenerate*")

    return "\n".join(lines)


def main():
    """Main entry point.

    Writes only on real change. With the timestamp gone this is no longer a
    workaround for self-inflicted churn — identical input now genuinely means
    identical output — but it still spares the file a pointless rewrite on
    every commit.
    """
    content = generate_index()

    if INDEX_FILE.exists() and INDEX_FILE.read_text(encoding="utf-8") == content:
        print(f"Unchanged {INDEX_FILE}")
        return

    INDEX_FILE.write_text(content, encoding="utf-8")
    print(f"Generated {INDEX_FILE}")


if __name__ == "__main__":
    main()
