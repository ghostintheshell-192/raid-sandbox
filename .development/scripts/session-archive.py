#!/usr/bin/env python3
"""
session-archive.py
Archives Claude Code session transcripts, with credentials, keys and
emails masked (redact_transcript.py), to the journal.
Called automatically by the SessionEnd hook.

Input: JSON from stdin with session_id, transcript_path, cwd, reason
Output: Copies transcript to .memory-bank/journal/sessions/YYYY-MM-DD_HHmm_<short-id>.jsonl,
        mirrors Claude's project memory into .memory-bank/journal/memory/,
        and, when the journal is a git repository, commits and pushes it.
        Without a journal, falls back to .memory-bank/sessions/ (local only).
"""

import json
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from redact_transcript import redact_file  # noqa: E402  (sibling script)


def find_project_root(start_path: Path) -> Path:
    """Find project root by looking for .memory-bank folder."""
    current = start_path.resolve()
    while current != current.parent:
        if (current / ".memory-bank").exists():
            return current
        current = current.parent
    # Fallback: if no .memory-bank found, use current directory
    return start_path.resolve()


def main():
    # Read JSON from stdin
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"Failed to parse JSON input: {e}", file=sys.stderr)
        sys.exit(1)

    session_id = data.get("session_id", "unknown")
    transcript_path = Path(data.get("transcript_path", ""))
    reason = data.get("reason", "unknown")
    cwd = Path(data.get("cwd", "."))

    # Find project root
    project_root = find_project_root(cwd)
    journal = project_root / ".memory-bank" / "journal"
    if (journal / ".git").exists():
        destination_dir = journal / "sessions"
    else:
        journal = None
        destination_dir = project_root / ".memory-bank" / "sessions"
    destination_dir.mkdir(parents=True, exist_ok=True)

    short_id = session_id[:8] if len(session_id) >= 8 else session_id

    # Verify transcript exists (may not exist for short/empty sessions)
    if not transcript_path.exists():
        print(f"No transcript to archive (session: {short_id}, reason: {reason})")
        sys.exit(0)

    # Generate filename: YYYY-MM-DD_HHmm_<short-id>.jsonl
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    filename = f"{timestamp}_{short_id}.jsonl"
    destination_path = destination_dir / filename

    # Copy the transcript, then mask credentials, keys and emails in the copy
    try:
        shutil.copy2(transcript_path, destination_path)
        counts = redact_file(destination_path)
        if counts:
            summary = ", ".join(f"{k} {v}" for k, v in sorted(counts.items()))
            print(f"Redacted: {summary}")
        print(f"Session archived to {destination_path.relative_to(project_root)} (reason: {reason})")
    except Exception as e:
        print(f"Failed to copy transcript: {e}", file=sys.stderr)
        sys.exit(1)

    if journal is not None:
        snapshot_memory(project_root, journal)
        publish(journal, short_id)


def snapshot_memory(project_root: Path, journal: Path) -> None:
    """Mirror Claude's project memory into journal/memory/, so a cloud session,
    which has no memory directory of its own, can read it. The local directory
    is the source: a memory removed there is removed here. In a cloud session
    the directory does not exist and the snapshot is left as it is."""
    encoded = re.sub(r"[^A-Za-z0-9]", "-", str(project_root.resolve()))
    source = Path.home() / ".claude" / "projects" / encoded / "memory"
    if not source.is_dir():
        return
    target = journal / "memory"
    target.mkdir(exist_ok=True)
    kept = {f.name for f in source.glob("*.md")}
    for f in source.glob("*.md"):
        shutil.copy2(f, target / f.name)
    for f in target.glob("*.md"):
        if f.name not in kept:
            f.unlink()
    print(f"Memory snapshot: {len(kept)} files")


def publish(journal: Path, short_id: str) -> None:
    """Commit and push the journal. Best effort: a session must be able to end
    offline, so failures are reported and the transcript stays on disk."""
    steps = [
        # --sparse: cloud sessions clone only handoffs/, memory/ and notes/; sessions/ is outside the cone
        ["git", "-C", str(journal), "add", "--sparse", "-A"],
        ["git", "-C", str(journal), "commit", "-q", "-m", f"Archive session {short_id}"],
        ["git", "-C", str(journal), "push", "-q"],
    ]
    for cmd in steps:
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        except (OSError, subprocess.TimeoutExpired) as e:
            print(f"Journal not published ({cmd[3]}): {e}", file=sys.stderr)
            return
        if result.returncode != 0:
            print(f"Journal not published ({cmd[3]}): {result.stderr.strip()}", file=sys.stderr)
            return
    print("Journal committed and pushed")


if __name__ == "__main__":
    main()
