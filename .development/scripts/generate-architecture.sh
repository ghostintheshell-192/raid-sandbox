#!/bin/bash
# Generate ARCHITECTURE.md with project tree and file descriptions.
# Descriptions are extracted by a language-specific extract-summary script.
#
# Usage: .development/scripts/generate-architecture.sh

set -e

# ─── Common Setup ─────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$DEV_DIR")"
OUTPUT_FILE="$DEV_DIR/ARCHITECTURE.md"
ADR_DIR="$DEV_DIR/reference/decisions"

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# ─── Project Configuration ────────────────────────────────────────────
# Modify this section for each project. DevDash substitutes the {PLACEHOLDER}
# tokens when applying the scaffold; edit them by hand otherwise.

PROJECT_NAME="RAID Sandbox"
# Source-file globs to scan (e.g. "*.py" / "*.ts" "*.tsx" / "*.cpp" "*.h").
FILE_GLOBS=("*.js")
SKIP_FILES=()
EXCLUDE_DIRS=("build" "dist" "out" "node_modules" "target" "vendor" "external" ".git")
EXTRACT_CMD="$SCRIPT_DIR/extract-summary.sh"
MAX_DESC_LENGTH=200
DOCS_REF="\`.development/specs/\`"

# Source directories to scan (e.g. "$PROJECT_ROOT/src").
# Root-level scripts (kb.js) are deliberately out: they belong to the static
# pages, not to the sandbox engine this map is for.
SOURCE_DIRS=("$PROJECT_ROOT/src" "$PROJECT_ROOT/tests")
# Base for relative path calculation (the printed "### dirname" headers).
REL_BASE="$PROJECT_ROOT"

# Project-specific header content (architecture/layer overview block).
# Substituted by DevDash; replace by hand with your own overview otherwise.
generate_project_header() {
    cat << 'EOF'
## Layer Overview

Vanilla HTML/CSS/JS, no framework and no build step. Files are IIFEs attached to
a global namespace (`root.RaidRender`, `root.CanvasState`, …), not ES modules.

```text
data/ (YAML)  →  engine/  →  sandbox/  →  DOM
                    ↑
                 challenge/
```

- **`src/engine/`** — headless and DOM-free. `model.js` (recursive domain model +
  level recognizer), `layout.js` (physical placement grid), `validator.js`
  (constraint engine). This layer is what the headless suites assert against,
  and it must stay independent of the DOM for that to remain possible.
- **`src/sandbox/`** — owns the DOM. Controllers (`canvas-controller.js`,
  `physical-controller.js`), state (`canvas-state.js`), rendering
  (`render.js`), and the touch shim (`touch-dnd.js`) that stands in for the
  HTML5 drag-and-drop API where it does not exist.
- **`src/challenge/`** — challenge mode, built on top of the same engine.
- **`data/`** — YAML resource files, parsed in-browser. The headless tests do
  not read them: they must run with zero dependencies.

The dependency arrow points one way. `engine/` never reaches into `sandbox/`.

**Ground truth**: layouts are anchored to the Linux `md` kernel source
(`drivers/md/raid5.c`, `raid10.c`). Golden tables are hand-derived from the
kernel rules and never regenerated from the engine.
EOF
}

# ─── Generic Logic (same across projects) ──────────────────────────────

is_excluded_dir() {
    local dirname="$1"
    for excl in "${EXCLUDE_DIRS[@]}"; do
        [[ "$dirname" == "$excl" ]] && return 0
    done
    return 1
}

is_skipped_file() {
    local filename="$1"
    for skip in "${SKIP_FILES[@]}"; do
        [[ "$filename" == "$skip" ]] && return 0
    done
    return 1
}

# Populate the global array FIND_NAME_ARGS with `find` -name predicates, -o
# between each pattern.
#
# Array form, spliced quoted into `find` — NOT a string through `eval`. With
# `eval` the shell performs pathname expansion on the unquoted globs against
# the CWD (the repo root): `kb.js` sits there, so `*.js` expanded to `kb.js`
# and the tree came out empty while still reporting success. Tracked upstream
# in dev-dash as `scaffold-architecture-eval-glob-expansion` (Option A).
build_find_name_args() {
    FIND_NAME_ARGS=()
    local first=1
    for glob in "${FILE_GLOBS[@]}"; do
        if [ $first -eq 1 ]; then
            FIND_NAME_ARGS+=(-name "$glob")
            first=0
        else
            FIND_NAME_ARGS+=(-o -name "$glob")
        fi
    done
}

generate_adr_list() {
    if [[ ! -d "$ADR_DIR" ]]; then
        echo "- See \`reference/decisions/\` for architecture decisions"
        return
    fi

    for adr in "$ADR_DIR"/[0-9]*.md; do
        [[ -f "$adr" ]] || continue
        local filename number title summary impact line
        filename=$(basename "$adr" .md)
        number="${filename%%-*}"
        # Real H1 title (strip leading "# " and the "ADR-NNN:" prefix), not the slug.
        title=$(head -1 "$adr" | sed 's/^#[[:space:]]*//; s/^ADR-[0-9]*:[[:space:]]*//')
        summary=$(grep -m1 "^\*\*Summary\*\*:" "$adr" | sed 's/^\*\*Summary\*\*:[[:space:]]*//')
        impact=$(grep -m1 "^\*\*Impact\*\*:" "$adr" | sed 's/^\*\*Impact\*\*:[[:space:]]*//')
        line="- [ADR-$number: $title](reference/decisions/$filename.md)"
        [[ -n "$impact" ]] && line="$line \`[$impact]\`"
        [[ -n "$summary" ]] && line="$line — $summary"
        printf '%s\n' "$line"
    done
}

generate_header() {
    echo "# Architecture Reference"
    echo ""
    echo "Quick reference for navigating the $PROJECT_NAME codebase."
    echo "For detailed documentation, see $DOCS_REF."
    echo ""

    generate_project_header

    echo ""
    echo "## Key Decisions"
    echo ""

    generate_adr_list

    echo ""
    echo "## Project Tree"
    echo ""
    echo "> Auto-generated from source code."
    echo "> Run \`.development/scripts/generate-architecture.sh\` to update."
    echo ""
}

process_directory() {
    local dir="$1"
    local reldir="${dir#$REL_BASE/}"

    # Get files directly in this directory matching any of FILE_GLOBS.
    local files=()
    build_find_name_args
    while IFS= read -r -d '' file; do
        files+=("$file")
    done < <(find "$dir" -maxdepth 1 -type f \( "${FIND_NAME_ARGS[@]}" \) -print0 2>/dev/null | sort -z)

    # Filter out skipped files
    local filtered=()
    for filepath in "${files[@]}"; do
        local filename
        filename=$(basename "$filepath")
        is_skipped_file "$filename" || filtered+=("$filepath")
    done

    # Only print header if there are non-skipped files
    if [[ ${#filtered[@]} -gt 0 ]]; then
        echo ""
        echo "### $reldir"

        for filepath in "${filtered[@]}"; do
            local file
            file=$(basename "$filepath")
            local desc
            desc=$($EXTRACT_CMD "$filepath" 2>/dev/null || true)

            if [[ -z "$desc" ]]; then
                echo "- \`$file\`"
            elif [[ ${#desc} -gt $MAX_DESC_LENGTH ]]; then
                echo "- \`$file\` — ${desc:0:$MAX_DESC_LENGTH}..."
            else
                echo "- \`$file\` — $desc"
            fi
        done
    fi

    # Process subdirectories
    local subdirs=()
    while IFS= read -r -d '' subdir; do
        subdirs+=("$subdir")
    done < <(find "$dir" -maxdepth 1 -mindepth 1 -type d -print0 2>/dev/null | sort -z)

    for subdir in "${subdirs[@]}"; do
        local dirname
        dirname=$(basename "$subdir")
        is_excluded_dir "$dirname" && continue
        process_directory "$subdir"
    done
}

generate_tree() {
    for source_dir in "${SOURCE_DIRS[@]}"; do
        [[ -d "$source_dir" ]] || continue
        process_directory "$source_dir"
    done
}

generate_footer() {
    echo ""
    echo "---"
    echo ""
    echo "*Auto-generated by \`.development/scripts/generate-architecture.sh\`*"
}

count_stats() {
    local total=0
    local missing=0
    build_find_name_args

    for source_dir in "${SOURCE_DIRS[@]}"; do
        [[ -d "$source_dir" ]] || continue

        # Build excluded-dirs prune args (array, same reason as above)
        local prune=()
        for excl in "${EXCLUDE_DIRS[@]}"; do
            prune+=(-path "*/${excl}/*" -prune -o)
        done

        while IFS= read -r -d '' filepath; do
            local filename
            filename=$(basename "$filepath")
            is_skipped_file "$filename" && continue
            ((total++)) || true
            local desc
            desc=$($EXTRACT_CMD "$filepath" 2>/dev/null || true)
            if [[ -z "$desc" ]]; then
                ((missing++)) || true
            fi
        done < <(find "$source_dir" "${prune[@]}" \( "${FIND_NAME_ARGS[@]}" \) -type f -print0 2>/dev/null)
    done

    echo "$total $missing"
}

main() {
    echo "Generating architecture reference..."

    {
        generate_header
        generate_tree
        generate_footer
    } > "$OUTPUT_FILE"

    echo -e "${GREEN}Generated:${NC} $OUTPUT_FILE"

    local stats
    stats=$(count_stats)
    local total="${stats% *}"
    local missing="${stats#* }"

    echo ""
    echo "Stats: $total files, $missing without summary"

    if [[ $missing -gt 0 ]]; then
        echo -e "${YELLOW}Tip:${NC} Add a top-of-file comment block to describe the file/class purpose"
    fi
}

main "$@"
