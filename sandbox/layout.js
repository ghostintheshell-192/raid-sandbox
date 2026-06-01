/**
 * layout.js — RAID Sandbox: headless data-placement engine (Phase 2a).
 *
 * Given a LEAF array (members are disks), computes the placement grid:
 * for each stripe (row) and each disk (column), what lands there —
 * a data segment, a parity block (P/Q), or a mirror copy.
 *
 * This is the part that makes axis B (data layout) verifiable: the grid it
 * produces for left-symmetric reproduces the hand tables in
 * `.personal/segment-allocation-rule-left-symmetric.md`. The DOM animator
 * (Phase 2b) plays this grid; it does not compute it.
 *
 * Graceful degradation (spec §5b): an unknown algorithm name falls back to the
 * layout's default and reports it via `degraded`; the build never breaks.
 *
 *   computePlacement(arrayNode, { stripes }) →
 *     { columns, stripes:[[cell,...],...], algorithm, degraded } | { unsupported, reason }
 *   cell = { role:'data'|'P'|'Q'|'mirror', seg:int|null }
 */

(function (root) {
  'use strict';

  // Known parity placement algorithms (descriptors). Others degrade to the default.
  const PARITY_ALGORITHMS = {
    'left-symmetric':  { rotate: 'left'  },
    'right-symmetric': { rotate: 'right' },
  };
  const DEFAULT_PARITY_ALGO = 'left-symmetric';

  const mod = (x, n) => ((x % n) + n) % n;

  /**
   * @param node  a leaf array (segmentation, redundancy, members:[disk])
   * @param opts  { stripes?:number } number of stripe rows to render
   */
  function computePlacement(node, opts = {}) {
    if (!node || node.kind !== 'array' || !node.members.every((m) => m && m.kind === 'disk')) {
      return { unsupported: true, reason: 'placement is defined for leaf arrays only (v1)' };
    }
    const n = node.members.length;
    const { segmentation, redundancy } = node;

    if (redundancy === 'none')
      return segmentation === 'striped'
        ? placeStripe(n, opts.stripes ?? 4)
        : placeLinear(n, opts.stripes ?? 4);
    if (redundancy === 'mirror')  return placeMirror(n, opts.stripes ?? 4);
    if (redundancy === 'parity1') return placeParity(n, 1, node.algorithm, opts.stripes ?? n);
    if (redundancy === 'parity2') return placeParity(n, 2, node.algorithm, opts.stripes ?? n);
  }

  // --- striped + none → RAID 0: segments fill left→right, row by row ----------
  function placeStripe(n, rows) {
    let seg = 0;
    const stripes = Array.from({ length: rows }, () =>
      Array.from({ length: n }, () => ({ role: 'data', seg: seg++ }))
    );
    return { columns: n, stripes, algorithm: null, degraded: false };
  }

  // --- linear + none → JBOD/concat: one segment per disk, filled in order -----
  function placeLinear(n, rows) {
    // Concatenation has no stripes; we show one row where disk d holds segment d.
    const stripes = [Array.from({ length: n }, (_, d) => ({ role: 'data', seg: d }))];
    return { columns: n, stripes, algorithm: null, degraded: false };
  }

  // --- mirror → RAID 1: each segment copied to every disk ---------------------
  function placeMirror(n, rows) {
    const stripes = Array.from({ length: rows }, (_, s) =>
      Array.from({ length: n }, (_, d) => ({ role: d === 0 ? 'data' : 'mirror', seg: s }))
    );
    return { columns: n, stripes, algorithm: null, degraded: false };
  }

  // --- parity1/parity2 → RAID 5/6, rotating parity (left-symmetric default) ----
  function placeParity(n, pCount, requested, rows) {
    const { algoName, degraded } = resolveParityAlgo(requested);
    const rotate = PARITY_ALGORITHMS[algoName].rotate;

    let seg = 0;
    const stripes = [];
    for (let s = 0; s < rows; s++) {
      // Parity anchor: left-symmetric starts rightmost and moves left each stripe.
      const anchor = rotate === 'left' ? mod(n - 1 - s, n) : mod(s, n);
      const row = Array.from({ length: n }, () => null);

      // Place parity blocks: P at anchor, Q just "inward" (left) of P.
      const parityAt = {};
      for (let k = 0; k < pCount; k++) {
        const pos = mod(anchor - k, n);
        parityAt[pos] = k === 0 ? 'P' : 'Q';
        row[pos] = { role: parityAt[pos], seg: null };
      }

      // Data fills from immediately right of the anchor, wrapping, skipping parity.
      let disk = mod(anchor + 1, n);
      const dataNeeded = n - pCount;
      for (let placed = 0, steps = 0; placed < dataNeeded && steps < n * 2; steps++) {
        if (!(disk in parityAt)) { row[disk] = { role: 'data', seg: seg++ }; placed++; }
        disk = mod(disk + 1, n);
      }
      stripes.push(row);
    }
    return { columns: n, stripes, algorithm: algoName, degraded };
  }

  function resolveParityAlgo(requested) {
    if (requested && PARITY_ALGORITHMS[requested]) return { algoName: requested, degraded: false };
    if (requested) {
      return { algoName: DEFAULT_PARITY_ALGO,
               degraded: `unknown algorithm "${requested}" → fell back to ${DEFAULT_PARITY_ALGO}` };
    }
    return { algoName: DEFAULT_PARITY_ALGO, degraded: false };
  }

  const Layout = { computePlacement, PARITY_ALGORITHMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Layout;
  else root.RaidLayout = Layout;

})(typeof globalThis !== 'undefined' ? globalThis : this);
