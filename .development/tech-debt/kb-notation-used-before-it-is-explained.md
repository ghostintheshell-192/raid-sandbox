---
type: feature
priority: medium
status: open
discovered: 2026-09-25
related: [kb-inline-code-and-math-blend-into-prose.md]
related_decision: null
---

# Mathematical notation in the knowledge base is named, not explained

## Problem

The knowledge base shows the real mathematics of RAID, and it should keep doing so:
the complexity is part of the subject. But a symbol is often named and then used,
without the explanation a learner needs to read the formula that follows. The parity
page is the clearest case:

- **⊕.** "XOR, written ⊕, adds bits without carry" gives the rule but not what
  *exclusive or* means (the result is 1 when exactly one of the two bits is 1), what
  "without carry" means, or why the symbol is a plus in a circle (it is addition
  modulo 2). A reader who meets `new parity = (old data ⊕ new data) ⊕ old parity`
  further down may take ⊕ for another operation they half remember (convolution is
  written ∗; ⊕ also means *direct sum* in algebra).
- **The same operation, two symbols.** The RAID 6 formulas are quoted in H. Peter
  Anvin's notation, where `+` is XOR and `·` is multiplication in GF(2⁸). The page
  wrote ⊕ a few lines earlier, so `P = D₀ + D₁ + …` reads as ordinary addition.
- **GF(2⁸), generator, syndrome, Reed-Solomon.** Named in one sentence each, with no
  explanation of what a finite field is or why its arithmetic lets the two equations
  be solved together.

## Analysis

The writing rules already ask for formulas as monospace text with the legend of the
symbols first (`~/.claude/writing-style.md`, *Completeness over brevity*). The legend
is there for the variables (*D₀*, *P*) but not for the operators, and a concept named
without its own entry leaves the reader without a place to go.

## Possible Solutions

- **Option A**: explain in place. Extend the XOR section (the truth table of exclusive
  or, what carry means, addition modulo 2 and the symbol), and put an operator legend
  before the RAID 6 formulas (`+` is XOR here, `·` is multiplication in GF(2⁸)).
- **Option B**: new concept entries for the mathematics (XOR, finite field /
  GF(2⁸), Reed-Solomon code), linked with `[[id]]` wherever they are used, each with
  its own short and long form and its sources.
- **Option C**: A for the operator legend, which belongs next to the formula, and B
  for the concepts that deserve a page of their own.

**How an operation is carried out, shown.** Beside the explanation, an operation the
reader has to follow gets a small worked box: for XOR, the truth table of the two
bits and one byte-wide example set out in columns, bits aligned as in a school
addition, with the carry that XOR drops pointed out. It sits in a block under the
formula, or in a closed `<details>` ("How XOR is computed") if it weighs on the page,
not in a hover tooltip: the knowledge base is read on phones too (ADR-003), where
hover does not exist, and a box that appears only on hover is invisible to the
reader who needs it.

## Recommended Approach

Option C, with the worked boxes. The legend is a local fix and follows the existing formula rule; the
concept entries follow the knowledge base's own shape (one source, two depths). Audit
the other pages for the same gap first: `write-penalty`, `capacity`,
`fault-tolerance` and the level pages' worked calculations all carry formulas.

## Notes

- Every new explanation is a statement with a source: a textbook or a primary
  reference for XOR and finite fields, Anvin's paper for GF(2⁸) in RAID 6.
- Raised by Valentina while reading the parity page as a learner: "we should not
  hide the complexity from the reader, but it is right to explain it where
  possible".

## Related Documentation

- **Related Issues**: `kb-inline-code-and-math-blend-into-prose.md`
- **Code Locations**: `data/kb/parity.yaml` (*The XOR arithmetic*, *Single and double parity*)

---

📍 **Investigation Note**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) to locate relevant files and understand the architectural context before starting your analysis.
