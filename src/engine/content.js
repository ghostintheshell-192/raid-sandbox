// @ts-check
/**
 * content.js — RAID Sandbox: the content algebra (specs/planned/degenerate-levels.md §6).
 *
 * TESTS ONLY. The game never loads this file (no script tag in index.html):
 * the declared `collapsesTo` rules run at runtime, and this is the independent
 * derivation that checks them (§7: "the test is the computation done in advance").
 *
 * layout.js gives every cell a ROLE (data / P / Q / mirror) and a segment. This
 * file gives every cell its symbolic CONTENT — a vector over the data segments
 * of its stripe:
 *
 *   data, segment 3                     → {3: 1}
 *   P of a stripe holding 0, 1, 2       → {0: 1, 1: 1, 2: 1}        the XOR
 *   Q of the same stripe                → {0: g⁰, 1: g¹, 2: g²}
 *   P of a stripe holding 0 alone       → {0: 1}                    it IS D0
 *   Q of the same                       → {0: g⁰} = {0: 1}          it IS D0
 *   a mirror cell of segment 3          → {3: 1}
 *
 * No Galois-field arithmetic: only that g⁰ = 1, that gⁱ ≠ gʲ for i ≠ j, and that a
 * combination of two or more terms is never a single block. From the contents:
 *
 *   - two cells on different disks with the same content are COPIES — by content,
 *     not by position, so `far` is a mirror exactly like `near`;
 *   - the number of copies per segment and the cells with two or more terms (real
 *     parity) describe the array's behaviour with no names at all.
 *
 * `behaviour(node)` turns that description into the shape it amounts to — the
 * same {segmentation, redundancy} vocabulary the level files use — so the oracle
 * (collapses-oracle.test.js) can hold the declared rules to it in both directions.
 *
 * Its limit, kept explicit (§6): equivalence of content is not identity. The
 * algebra proves "the data lands identically"; what a real system does with that
 * is the `source:` on the declared rule, not this file's business.
 *
 * The core (contents, equality, copy counting) knows nothing about RAID. The
 * RAID-specific part — how a role derives its content — is `contentOf`, and it
 * sits next to layout.js for the same reason layout.js is ADR-002's declared
 * exception: the golden tables bind both to the kernel.
 */

(function (/** @type {any} */ root) {   // the UMD host: window, or Node's global
  'use strict';

  const Layout = (typeof require !== 'undefined') ? require('./layout.js') : root.RaidLayout;

  // ---------------------------------------------------------------------------
  // CONTENTS — one symbolic vector per cell
  // ---------------------------------------------------------------------------

  /** A term's coefficient: 1, or gⁱ for i ≥ 1 (g⁰ is written 1 — that is the whole point). */
  const coef = (i) => (i === 0 ? '1' : `g^${i}`);

  /**
   * The content of every cell of a placement, row by row: a Map segment → coefficient,
   * or null for a cell that holds nothing (parity over an empty stripe).
   * @param {Placement} placement
   * @returns {(Map<number, string> | null)[][]}
   */
  function contents(placement) {
    if (!('stripes' in placement)) return [];
    return placement.stripes.map((row) => {
      // The data segments of THIS stripe, in segment order — what P sums and Q weights.
      const segs = row.filter((c) => c.role === 'data' && c.seg !== null)
        .map((c) => /** @type {number} */ (c.seg)).sort((a, b) => a - b);
      return row.map((cell) => {
        if (cell.role === 'data' || cell.role === 'mirror')
          return cell.seg === null ? null : new Map([[cell.seg, '1']]);
        if (segs.length === 0) return null;                       // parity of nothing
        const m = new Map();
        segs.forEach((s, i) => m.set(s, cell.role === 'Q' ? coef(i) : '1'));
        return m;
      });
    });
  }

  /** Canonical string of a content, so equal contents compare equal. */
  const key = (content) =>
    [...content.entries()].sort((a, b) => a[0] - b[0]).map(([s, c]) => `${s}:${c}`).join(',');

  const isSingleBlock = (content) => content.size === 1 && [...content.values()][0] === '1';

  // ---------------------------------------------------------------------------
  // BEHAVIOUR — what the contents say the array does, with no names
  // ---------------------------------------------------------------------------

  /**
   * @param {ArrayNode} node  a LEAF array (members are disks); nested nodes are
   *                          out of scope — their collapse composes structurally (§3)
   * @param {{ stripes?: number, chunks?: number }} [opts]
   * @returns {{ disks: number, segments: number, copies: { min: number, max: number },
   *             parityPerStripe: number, rows: number,
   *             shape: { segmentation: Segmentation, redundancy: Redundancy } | null,
   *             note: string | null }}
   */
  function behaviour(node, opts = {}) {
    const placement = Layout.computePlacement(node, opts);
    const n = node.members.length;
    if (!('stripes' in placement))
      return { disks: n, segments: 0, copies: { min: 0, max: 0 }, parityPerStripe: 0, rows: 0,
               shape: null, note: placement.reason };

    const grid = contents(placement);

    // copies(s): the DISTINCT disks holding a cell whose content is exactly {s: 1}.
    /** @type {Map<number, Set<number>>} */
    const holders = new Map();
    let parityPerStripe = 0;
    grid.forEach((row) => {
      let parityHere = 0;
      row.forEach((content, disk) => {
        if (!content) return;
        if (isSingleBlock(content)) {
          const s = [...content.keys()][0];
          if (!holders.has(s)) holders.set(s, new Set());
          holders.get(s).add(disk);
        } else {
          parityHere++;
        }
      });
      parityPerStripe = Math.max(parityPerStripe, parityHere);
    });

    const segments = holders.size;
    if (segments === 0)
      return { disks: n, segments, copies: { min: 0, max: 0 }, parityPerStripe, rows: grid.length,
               shape: null, note: 'holds no data — every cell is parity over an empty stripe' };

    const counts = [...holders.values()].map((set) => set.size);
    const copies = { min: Math.min(...counts), max: Math.max(...counts) };

    /** @type {{ segmentation: Segmentation, redundancy: Redundancy } | null} */
    let shape = null;
    let note = null;
    if (parityPerStripe >= 3) {
      note = 'three or more parity terms per stripe — no shape in the two-axis model';
    } else if (parityPerStripe > 0) {
      shape = { segmentation: 'striped', redundancy: parityPerStripe === 1 ? 'parity1' : 'parity2' };
    } else if (copies.min >= 2) {
      // Every disk holds every segment → a plain mirror, whatever the drawn rows say
      // (far puts the copies in other rows; by content it is a mirror all the same).
      shape = copies.min === n
        ? { segmentation: 'linear',  redundancy: 'mirror' }
        : { segmentation: 'striped', redundancy: 'mirror' };
    } else {
      // No redundancy at all. Striped vs linear is the one distinction the contents
      // cannot make (a segment is a segment); it is read off the placement's rows —
      // a concatenation is drawn as a single row, one segment per disk.
      shape = grid.length > 1 || n === 1
        ? { segmentation: 'striped', redundancy: 'none' }
        : { segmentation: 'linear',  redundancy: 'none' };
    }
    return { disks: n, segments, copies, parityPerStripe, rows: grid.length, shape, note };
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  const RaidContent = { contents, behaviour, key, isSingleBlock };

  if (typeof module !== 'undefined' && module.exports) module.exports = RaidContent;
  else root.RaidContent = RaidContent;

})(typeof globalThis !== 'undefined' ? globalThis : this);
