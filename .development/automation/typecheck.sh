#!/bin/bash
# Automation entry point: the editor-level type check, from a terminal.
#
# Contract: runs from the repo root; exit != 0 = type errors.
#
# The engine files opt into checking with `// @ts-check` (jsconfig.json keeps
# checkJs off, so the migration stays incremental); the shapes are JSDoc
# typedefs in src/engine/types.js. Nothing is emitted and nothing is installed
# into the repo: TypeScript is fetched by npx into its own cache, so the
# zero-dependency stance of the runtime and of the test suites holds.
#
# Locally, VS Code shows the same diagnostics inline without this script.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

# npx needs a writable cache; in sandboxed shells the default is read-only.
export npm_config_cache="${npm_config_cache:-${TMPDIR:-/tmp}/npm-cache}"

if npx -y -p typescript@5 tsc -p jsconfig.json; then
    echo "typecheck: OK"
else
    echo "typecheck: FAILED (see above)"
    exit 1
fi
