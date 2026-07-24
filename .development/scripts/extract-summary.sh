#!/bin/bash
# Extract a short description from a source file, used by generate-architecture.sh
# to annotate the project tree.
#
# Extend the `case` below for your project's language. Shipped handlers:
#   - C# files: the body of the first /// <summary>...</summary> XML doc comment.
#   - C/C++ files (.cpp/.cc/.cxx/.h/.hpp/.hxx): the first contiguous //
#     comment block at the top of the file (file-level attribution / purpose,
#     or class-level "why it exists" comment if no file-level block exists).
# For other languages, add a branch that prints the file's leading doc comment
# (docstring, JSDoc, etc.) on stdout.
#
# Usage: extract-summary.sh <filepath>
# Output: description text on stdout (empty if none found).

filepath="$1"
[[ -f "$filepath" ]] || exit 0

case "$filepath" in
    *.cs)
        awk '
            /\/\/\/ <summary>/ {
                in_summary = 1
                summary = ""
                next
            }
            /\/\/\/ <\/summary>/ {
                in_summary = 0
                next
            }
            in_summary && /\/\/\// {
                line = $0
                gsub(/^[[:space:]]*\/\/\/[[:space:]]*/, "", line)
                if (summary != "") summary = summary " "
                summary = summary line
            }
            /^[[:space:]]*(public|internal|private|protected)?[[:space:]]*(sealed|abstract|static|partial)?[[:space:]]*(class|interface|record|struct|enum)[[:space:]]/ {
                if (summary != "") {
                    print summary
                    exit
                }
            }
        ' "$filepath" 2>/dev/null
        ;;
    *.cpp|*.cc|*.cxx|*.h|*.hpp|*.hxx)
        # C++: first contiguous // (or ///) comment block. Skips blank lines
        # and preprocessor directives before the block; ends at the first
        # non-comment, non-blank, non-preprocessor line after the block opens.
        # Output is emitted once via END (avoids double-print on early exit).
        awk '
            BEGIN { state = "before"; summary = "" }

            # Lines starting with // or /// at any indent are comment lines.
            /^[[:space:]]*\/\// {
                line = $0
                gsub(/^[[:space:]]*\/\/+[[:space:]]*/, "", line)
                state = "in_block"
                if (summary != "") summary = summary " "
                summary = summary line
                next
            }

            # Blank lines: ignored.
            /^[[:space:]]*$/ { next }

            # Preprocessor directives: if we are already in a block, end it.
            # Otherwise (still before the block), ignore them.
            /^[[:space:]]*#/ {
                if (state == "in_block") exit
                next
            }

            # Any other non-comment, non-blank line: end the block (or never started).
            { exit }

            END {
                if (state == "in_block" && summary != "") print summary
            }
        ' "$filepath" 2>/dev/null
        ;;
    *.js)
        # JS: the leading /** ... */ JSDoc block, first paragraph only (up to
        # the first blank comment line). Every source file in this project opens
        # with one — see .claude/rules/coding-standards.md. The convention is
        # "<filename> — <purpose>"; the filename prefix is dropped because the
        # tree already shows it.
        awk -v base="$(basename "$filepath")" '
            BEGIN { state = "before"; summary = "" }

            # Skip blank lines before the block; anything else means no header.
            state == "before" && /^[[:space:]]*\/\*\*/ { state = "in_block"; next }
            state == "before" && /^[[:space:]]*$/ { next }
            state == "before" { exit }

            state == "in_block" {
                line = $0
                sub(/\*\/.*$/, "", line)              # drop the closing delimiter
                gsub(/^[[:space:]]*\*?[[:space:]]?/, "", line)
                sub(/[[:space:]]+$/, "", line)
                if (line == "") {
                    if (summary != "") exit           # paragraph break: done
                    next                              # leading blank comment line
                }
                if (summary != "") summary = summary " "
                summary = summary line
            }

            # Closing delimiter on this line: the block is over.
            /\*\// { if (state == "in_block") exit }

            END {
                if (summary == "") exit
                if (index(summary, base) == 1) {
                    summary = substr(summary, length(base) + 1)
                    # Alternation, not a character class: an em-dash is three
                    # bytes and a bracket expression would match one of them.
                    sub(/^[[:space:]]*(—|–|-|:)[[:space:]]*/, "", summary)
                }
                print summary
            }
        ' "$filepath" 2>/dev/null
        ;;
esac
