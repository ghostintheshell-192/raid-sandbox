---
captured: 2026-09-27
status: open
context: "KB verification of hba (branch feature/kb-glossary-terms): the pages name many chips and cards (SAS3916, SAS3816, LSI 9300-8i, MegaRAID 9560...)"
tags: [kb, hardware, reference, glossary]
---

# A reference page for the real chips and cards the pages mention

## The idea

The verification work keeps meeting real products: RAID-on-Chip and I/O
controller chips, HBA and RAID cards, cache protection modules. A page (or a
second glossary) could list them, each with its vendor, what kind of component
it is (RoC, I/O controller, HBA card, RAID card), what RAID it supports, and
the source it was read from.

## Why it deserves attention

- A learner who meets "the SAS3916" in a sentence has nowhere to place it.
- The facts are already collected, with sources, during the page
  verifications; they are scattered across the bibliographies.

## Caution

- Models age fast, and every row is a statement that needs a source (ADR-004).
  Better a short page of a few chips chosen because they are exemplary (one
  RoC, one I/O controller, one card of each kind, one per vendor) than a
  catalogue.
- Useful to us as a reference for the verification; for the learner only if
  each row says why that chip is there.

## Minimal next step

After the physical pages are verified, list the products their sources name
and decide which few are worth a row.
