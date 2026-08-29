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

# 2. Register the merge driver the derived docs are marked with in
#    .gitattributes. `true` exits 0 without touching the file, which leaves our
#    side in place; post-merge then regenerates it from the merged tree, so
#    which side survived the merge does not matter for a file a generator owns
#    end to end. This is what makes tracking ARCHITECTURE.md and INDEX.md
#    viable — the conflict on every parallel branch is why they were ignored
#    until 1e55217.
#
#    Registered rather than shipped: git keeps merge drivers in config for the
#    same reason it will not auto-enable hooks. And it belongs next to
#    core.hooksPath above, because without the hooks the attribute would quietly
#    keep one side and never regenerate — worse than the conflict it replaces.
git config merge.generated.name "keep either side; post-merge regenerates"
git config merge.generated.driver true
echo "✓ merge.generated -> registered (derived docs resolve by regeneration)"

# 3. Verify what the hook modules and the test entry point actually need.
#    node runs the headless suites; python3 drives two of the doc generators
#    (and the YAML-reading suites, this repo having no Node YAML parser).
for tool in bash node python3; do
    if command -v "$tool" >/dev/null 2>&1; then
        echo "✓ $tool available"
    else
        echo "✗ MISSING: $tool"
    fi
done

# 4. Make sure entry points and hooks are executable.
chmod +x .development/automation/*.sh .githooks/pre-commit .githooks/post-merge \
    .githooks/pre-commit.d/* 2>/dev/null || true
echo "✓ entry points and hooks executable"

echo ""
echo "Done. Project hooks are active for this clone:"
echo "  00-branch-protection  nothing is authored on main; only merges land there"
echo "  01-security           blocks staged secrets"
echo "  04-docs-update        regenerates and stages the derived docs on commit"
echo "  post-merge            regenerates them again after a merge, which"
echo "                        bypasses pre-commit entirely"
