/**
 * layout-raid10-reference.js — Reference tables for RAID10 near/far/offset layouts.
 *
 * PENDING IMPLEMENTATION: these tables cannot be run as assertions yet because
 * computePlacement() in layout.js currently handles leaf arrays only. RAID10 is
 * a nested topology (striped+none over linear+mirror spans) and requires a
 * dedicated placeRaid10() code path.
 *
 * When that implementation lands, this file becomes the golden table test suite.
 * Run as a reference viewer: node layout-raid10-reference.js
 *
 * ─────────────────────────────────────────────────────────────
 * SOURCES
 * ─────────────────────────────────────────────────────────────
 * Linux kernel drivers/md/raid10.c header comment (retrieved via curl):
 *
 *   "The data to be stored is divided into chunks using chunksize. Each device
 *    is divided into far_copies sections. In each section, chunks are laid out
 *    in a style similar to raid0, but near_copies copies of each chunk is stored
 *    (each on a different drive). The starting device for each section is offset
 *    near_copies from the starting device of the previous section."
 *
 *   "If far_offset is true, then the far_copies are handled a bit differently.
 *    The copies are still in different stripes, but instead of being very far
 *    apart on disk, there are adjacent stripes."
 *
 *   Example 'far' w/o use_far_sets (4 disks):
 *     A B C D
 *     D A B C
 *
 *   Example 'offset' (derived from far_offset=true, 4 disks):
 *     stripe 0: A B C D   (original)
 *     stripe 1: D A B C   (copy, shifted right by near_copies=1)
 *
 * .personal/distribuzione-segmenti-algoritmi.md (Valentina's notes):
 *   - near: copie su dischi adiacenti; default
 *   - far:  prima metà = striping puro; seconda metà = copie shiftate di 1 disco
 *   - offset: compromesso near/far; copia su riga adiacente, shiftata di 1
 *
 * ─────────────────────────────────────────────────────────────
 * MODEL MAPPING
 * ─────────────────────────────────────────────────────────────
 * In our domain model RAID10 = nested array:
 *
 *   Array { striped, none, algorithm: 'near'|'far'|'offset', members: [
 *     Array { linear, mirror, members: [D0, D1] },   // span 0
 *     Array { linear, mirror, members: [D2, D3] },   // span 1
 *   ]}
 *
 * The `algorithm` on the top-level array selects near/far/offset.
 * All three share the same recognizer result (RAID 10) and capacity/FT;
 * only the data placement (and thus the animation) differs.
 *
 * ─────────────────────────────────────────────────────────────
 * NOTATION
 * ─────────────────────────────────────────────────────────────
 * role: 'orig' = first copy (canonical data), 'copy' = mirror replica
 * chunk: 0-based logical chunk index (same number on orig and copy)
 * A RAID10 grid row represents one stripe across all physical disks.
 */

'use strict';

// ---------------------------------------------------------------------------
// NEAR  (default, n_near=2, n_far=1)
// ---------------------------------------------------------------------------
// Copies are on adjacent disks within the same stripe.
// With 4 disks and near=2: effective 2 logical positions per stripe.
// Span 0 → [D0(orig), D1(copy)], Span 1 → [D2(orig), D3(copy)]
//
// 4 disks, near=2, 4 stripes:
//
//   stripe | D0         | D1         | D2         | D3
//     0    | c0 (orig)  | c0 (copy)  | c1 (orig)  | c1 (copy)
//     1    | c2 (orig)  | c2 (copy)  | c3 (orig)  | c3 (copy)
//     2    | c4 (orig)  | c4 (copy)  | c5 (orig)  | c5 (copy)
//     3    | c6 (orig)  | c6 (copy)  | c7 (orig)  | c7 (copy)
//
// Key property: any single-disk failure loses at most one span; the adjacent
// disk in the same span holds all the same data.

const NEAR_4_2 = [
  // [D0,         D1,         D2,         D3        ]
  [{ c:0,r:'orig'},{c:0,r:'copy'},{c:1,r:'orig'},{c:1,r:'copy'}],
  [{ c:2,r:'orig'},{c:2,r:'copy'},{c:3,r:'orig'},{c:3,r:'copy'}],
  [{ c:4,r:'orig'},{c:4,r:'copy'},{c:5,r:'orig'},{c:5,r:'copy'}],
  [{ c:6,r:'orig'},{c:6,r:'copy'},{c:7,r:'orig'},{c:7,r:'copy'}],
];

// ---------------------------------------------------------------------------
// FAR  (n_near=1, n_far=2)
// ---------------------------------------------------------------------------
// The array is split into two equal sections on disk.
// First section: pure RAID0 striping of all chunks (originals).
// Second section: same chunks, starting device shifted by near_copies=1 (copies).
//
// 4 disks, far=2, shown as 4 rows (2 original stripes + 2 copy stripes):
//
//   stripe | D0         | D1         | D2         | D3
//     0    | c0 (orig)  | c1 (orig)  | c2 (orig)  | c3 (orig)   ← first section
//     1    | c4 (orig)  | c5 (orig)  | c6 (orig)  | c7 (orig)
//    ...                                                          (far apart on disk)
//    N+0   | c3 (copy)  | c0 (copy)  | c1 (copy)  | c2 (copy)   ← second section
//    N+1   | c7 (copy)  | c4 (copy)  | c5 (copy)  | c6 (copy)
//
// Key property: each disk's copy section starts shifted by 1, so c0 lives on D0
// (orig) and D1 (copy) — different disks. Read throughput ≈ RAID0 (originals alone
// fill all disks sequentially). Write is slower (both sections must be written).

const FAR_4_2_ORIGINALS = [
  [{ c:0,r:'orig'},{c:1,r:'orig'},{c:2,r:'orig'},{c:3,r:'orig'}],
  [{ c:4,r:'orig'},{c:5,r:'orig'},{c:6,r:'orig'},{c:7,r:'orig'}],
];
const FAR_4_2_COPIES = [
  [{ c:3,r:'copy'},{c:0,r:'copy'},{c:1,r:'copy'},{c:2,r:'copy'}],
  [{ c:7,r:'copy'},{c:4,r:'copy'},{c:5,r:'copy'},{c:6,r:'copy'}],
];

// ---------------------------------------------------------------------------
// OFFSET  (far_offset=true, n_near=1, n_far=2)
// ---------------------------------------------------------------------------
// Like far, but copies are on immediately adjacent stripes instead of a
// distant section. Consecutive stripe pairs: [original, copy_shifted_by_1].
//
// 4 disks, offset=2, 4 stripes (2 pairs):
//
//   stripe | D0         | D1         | D2         | D3
//     0    | c0 (orig)  | c1 (orig)  | c2 (orig)  | c3 (orig)
//     1    | c3 (copy)  | c0 (copy)  | c1 (copy)  | c2 (copy)   ← copy, shifted +1
//     2    | c4 (orig)  | c5 (orig)  | c6 (orig)  | c7 (orig)
//     3    | c7 (copy)  | c4 (copy)  | c5 (copy)  | c6 (copy)
//
// Key property: orig and copy never share the same disk (shift guarantees it).
// Adjacent-disk failures can still destroy data (risk: if D0+D1 fail, c0 is lost),
// but this is the accepted trade-off for the offset layout's write performance.

const OFFSET_4_2 = [
  [{ c:0,r:'orig'},{c:1,r:'orig'},{c:2,r:'orig'},{c:3,r:'orig'}],
  [{ c:3,r:'copy'},{c:0,r:'copy'},{c:1,r:'copy'},{c:2,r:'copy'}],
  [{ c:4,r:'orig'},{c:5,r:'orig'},{c:6,r:'orig'},{c:7,r:'orig'}],
  [{ c:7,r:'copy'},{c:4,r:'copy'},{c:5,r:'copy'},{c:6,r:'copy'}],
];

// ---------------------------------------------------------------------------
// Reference printer (run this file to review the tables visually)
// ---------------------------------------------------------------------------

function printTable(label, rows) {
  const n = rows[0].length;
  console.log(`\n${label}`);
  console.log('stripe  ' + Array.from({length:n}, (_,i) => `D${i}`.padEnd(12)).join(''));
  rows.forEach((row, s) => {
    const cells = row.map(c => `c${c.c}(${c.r})`.padEnd(12)).join('');
    console.log(`  ${s}     ${cells}`);
  });
}

if (require.main === module) {
  console.log('RAID10 Reference Tables (pending implementation in layout.js)\n');
  printTable('NEAR  — 4 disks, near=2, 4 stripes', NEAR_4_2);
  printTable('FAR   — 4 disks, far=2  (originals)', FAR_4_2_ORIGINALS);
  printTable('FAR   — 4 disks, far=2  (copies, placed ~N/2 stripes later)', FAR_4_2_COPIES);
  printTable('OFFSET — 4 disks, offset=2, 4 stripes (pairs: orig+copy)', OFFSET_4_2);
  console.log('\nAll three invariants to verify when implementing:');
  console.log('  1. Each chunk appears exactly twice (once orig, once copy)');
  console.log('  2. Orig and copy of each chunk are on different physical disks');
  console.log('  3. Capacity = total_disks / copies  (here: 4/2 = 2 effective disks)');
}

module.exports = { NEAR_4_2, FAR_4_2_ORIGINALS, FAR_4_2_COPIES, OFFSET_4_2 };
