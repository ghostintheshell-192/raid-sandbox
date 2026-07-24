#!/bin/bash
# Automation entry point: run the headless test suites.
#
# Contract: runs from the repo root; no args = every suite; exit != 0 = failures.
#
# Each suite under tests/ is standalone and zero-dependency, and is meant to run
# in its own node process (see .claude/rules/workflow.md, "run one at a time").
# All of them run even after one goes red, so a single invocation surfaces every
# failure instead of stopping at the first.
#
# This is what CI executes too — the `headless` job calls this script, so the
# local command and the remote gate cannot drift apart.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

shopt -s nullglob
SUITES=(tests/*.test.js)
shopt -u nullglob

if [[ ${#SUITES[@]} -eq 0 ]]; then
    echo "test: no headless suites found under tests/ (no-op)"
    exit 0
fi

fail=0
for f in "${SUITES[@]}"; do
    # GitHub Actions folds each suite into its own collapsible group; locally
    # the markers would be noise, so they are emitted only under CI.
    [[ -n "${GITHUB_ACTIONS:-}" ]] && echo "::group::$f"
    node "$f" || fail=1
    [[ -n "${GITHUB_ACTIONS:-}" ]] && echo "::endgroup::"
done

if [[ $fail -ne 0 ]]; then
    echo "test: FAILED (see above)"
    exit 1
fi

echo "test: OK (${#SUITES[@]} suites)"
