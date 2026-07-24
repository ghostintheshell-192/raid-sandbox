#!/bin/bash
# One-time, per-clone activation of the project automation.
#
# Git refuses to auto-enable hooks shipped inside a repo — by design, since a
# clone would otherwise execute code from the remote. This script makes the
# opt-in a single explicit gesture:
#
#     bash .development/automation/bootstrap.sh
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "RAID Sandbox — automation bootstrap"
echo "-----------------------------------"

# 1. Activate the project hooks (local config wins over any global hooksPath).
git config core.hooksPath .githooks
echo "✓ core.hooksPath -> .githooks (local to this clone)"

GLOBAL_HOOKS=$(git config --global core.hooksPath 2>/dev/null || true)
if [[ -n "$GLOBAL_HOOKS" ]]; then
    echo "  note: global hooksPath ($GLOBAL_HOOKS) is now overridden for this repo"
fi

# 2. Verify what the hook modules and the test entry point actually need.
#    node runs the headless suites; python3 drives two of the doc generators
#    (and the YAML-reading suites, this repo having no Node YAML parser).
for tool in bash node python3; do
    if command -v "$tool" >/dev/null 2>&1; then
        echo "✓ $tool available"
    else
        echo "✗ MISSING: $tool"
    fi
done

# 3. Make sure entry points and hooks are executable.
chmod +x .development/automation/*.sh .githooks/pre-commit .githooks/pre-commit.d/* 2>/dev/null || true
echo "✓ entry points and hooks executable"

echo ""
echo "Done. Project hooks are active for this clone:"
echo "  00-branch-protection  main takes doc-only commits; code needs a branch"
echo "  01-security           blocks staged secrets"
echo "  04-docs-update        regenerates and stages the derived docs"
