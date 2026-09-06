#!/bin/bash
# Automation entry point: regenerate the derived documentation.
#
# Contract: runs from the repo root; idempotent; exits 0 unless a generator
# itself crashes. Prints which files it touched.
# Aggregates: ARCHITECTURE.md, INDEX.md, tech-debt/README.md.
#
# The same three generators are wired into SessionStart in
# .claude/settings.json; this script is the single place that knows the list,
# so the pre-commit module and the CLI call the same thing.
set -euo pipefail

SCRIPTS=.development/scripts

# A generator's own diagnostics used to go to /dev/null, so a failure surfaced
# as one uncoloured WARNING line among coloured successes and the message
# saying what actually went wrong — a missing path, a traceback — was thrown
# away. Capture instead of discard, and print it on failure: the caller cannot
# act on "generator failed".
run_generator()
{
    local label="$1"; shift
    local output
    if output=$("$@" 2>&1); then
        echo "docs-update: $label regenerated"
    else
        echo "docs-update: WARNING - $label generator failed" >&2
        printf '%s\n' "$output" | sed 's/^/    /' >&2
    fi
}

run_generator "ARCHITECTURE.md"      bash "$SCRIPTS/generate-architecture.sh"
run_generator "INDEX.md"             python3 "$SCRIPTS/generate-index.py"
run_generator "tech-debt/README.md"  python3 "$SCRIPTS/update-tech-debt-index.py"
# The knowledge base is derived documentation too, only its output is served to
# readers instead of read in the repo (specs/planned/knowledge-base.md §7).
run_generator "kb/"                  node "$SCRIPTS/generate-kb.js"
