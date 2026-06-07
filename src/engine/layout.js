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
 * Algorithm fallback (spec §5b): an unknown algorithm name falls back to the
 * layout's default and reports it via `fallback`; the build never breaks. This is
 * an internal safety net (e.g. a resource file naming a not-yet-implemented
 * primitive) — NOT a user-facing choice, and NOT the runtime "degraded" disk state.
 *
 *   computePlacement(arrayNode, { stripes }) →
 *     { columns, stripes:[[cell,...],...], algorithm, fallback } | { unsupported, reason }
 *   cell = { role:'data'|'P'|'Q'|'mirror', seg:int|null, seq:int }
 *
 * `seq` is the animation order: cells sharing a seq light up together; ascending
 * seq = write order. Parity gets a LATER seq than the data in its stripe, because
 * parity is computed from that data — the animation shows this causality.
 */

(function (root) {
  'use strict';

  // Known parity placement algorithms. Only algorithms with a golden table in
  // the test suite belong here. Unknown names fall back to the default.
  //
  // rotate:    'left'  → parity starts rightmost (n-1), moves LEFT each stripe
  //            'right' → parity starts leftmost  (0),   moves RIGHT each stripe
  // symmetric: true    → data fills from (anchor+1) wrapping (better seq-read locality)
  //            false   → data fills from disk 0, skipping parity (asymmetric)
  //
  // Golden tables derived from left-symmetric (verified vs .personal notes) plus
  // the canonical left/right × symmetric/asymmetric rule pair. All four variants
  // are present in Linux md/raid5 as ALGORITHM_LEFT_ASYMMETRIC(0),
  // RIGHT_ASYMMETRIC(1), LEFT_SYMMETRIC(2), RIGHT_SYMMETRIC(3).
  const PARITY_ALGORITHMS = {
    'left-symmetric':   { rotate: 'left',  symmetric: true  },
    'left-asymmetric':  { rotate: 'left',  symmetric: false },
    'right-asymmetric': { rotate: 'right', symmetric: false },
    'right-symmetric':  { rotate: 'right', symmetric: true  },
  };
  const DEFAULT_PARITY_ALGO = 'left-symmetric';

  const mod = (x, n) => ((x % n) + n) % n;

  /**
   * @param node  a leaf array (segmentation, redundancy, members:[disk])
   * @param opts  { stripes?:number } number of stripe rows to render
   */
  function computePlacement(node, opts = {}) {
    if (!node || node.kind !== 'array') return unsupported('placement needs an array');

    // Nested: a stripe over sub-arrays (RAID 1+0 today; RAID 50/60 later).
    const membersAreArrays = node.members.length > 0 && node.members.every((m) => m && m.kind === 'array');
    if (membersAreArrays) {
      if (node.segmentation === 'striped' && node.redundancy === 'none')
        return placeNested(node, opts);
      return unsupported('nested placement is defined only for a stripe (RAID 0) over spans');
    }

    if (!node.members.every((m) => m && m.kind === 'disk'))
      return unsupported('placement is defined for leaf arrays only (v1)');

    const n = node.members.length;
    const { segmentation, redundancy } = node;

    // A topology can be valid-but-unnamed (model.js still gives it capacity / fault
    // tolerance) yet have NO defined data placement. We refuse to invent one: only
    // the combinations with a real, golden-verifiable layout are animated; the rest
    // return `unsupported` so the UI says so honestly instead of faking a grid.

    if (redundancy === 'none')
      return segmentation === 'striped' ? placeStripe(n, opts.stripes ?? 4)
                                        : placeLinear(n, opts.stripes ?? 4);

    if (redundancy === 'mirror') {
      if (segmentation === 'linear') return placeMirror(n, opts.stripes ?? 4);
      // striped + mirror = flat RAID 10 (copies 2). Even disks only;
      // an odd count is RAID 1E (niche) — no verified placement yet.
      if (n % 2 !== 0)
        return unsupported('striped mirror with odd disks (RAID 1E) has no verified placement yet');
      return placeRaid10(n, node.algorithm, opts);
    }

    if (redundancy === 'parity1' || redundancy === 'parity2') {
      // Parity protects a stripe; without striping there is no stripe to compute it over.
      if (segmentation !== 'striped')
        return unsupported(`"${segmentation} + ${redundancy}" has no defined data placement (parity requires striping)`);
      return placeParity(n, redundancy === 'parity1' ? 1 : 2, node.algorithm, opts.stripes ?? n);
    }
  }

  const unsupported = (reason) => ({ unsupported: true, reason });

  // --- striped + none → RAID 0: segments fill left→right, row by row ----------
  function placeStripe(n, rows) {
    let seg = 0, t = 0;
    const stripes = Array.from({ length: rows }, () =>
      Array.from({ length: n }, () => ({ role: 'data', seg: seg++, seq: t++ }))
    );
    return { columns: n, stripes, algorithm: null, fallback: null };
  }

  // --- linear + none → JBOD/concat: one segment per disk, filled in order -----
  function placeLinear(n, rows) {
    // Concatenation has no stripes; we show one row where disk d holds segment d.
    const stripes = [Array.from({ length: n }, (_, d) => ({ role: 'data', seg: d, seq: d }))];
    return { columns: n, stripes, algorithm: null, fallback: null };
  }

  // --- mirror → RAID 1: each segment copied to every disk ---------------------
  function placeMirror(n, rows) {
    // A segment and its copies are written together → same seq per stripe.
    const stripes = Array.from({ length: rows }, (_, s) =>
      Array.from({ length: n }, (_, d) => ({ role: d === 0 ? 'data' : 'mirror', seg: s, seq: s }))
    );
    return { columns: n, stripes, algorithm: null, fallback: null };
  }

  // --- striped + mirror → flat RAID 10 (copies 2): near / far / offset --------
  // The mirror-class placement algorithms (§5b / §3a). Each chunk is stored twice;
  // the layout decides where the copy lands. Verified against the golden tables in
  // layout-raid10-reference.js (Linux md/raid10.c). 'data' = original, 'mirror' =
  // replica; orig and copy share `seg` (same chunk) and `seq` (written together).
  const RAID10_LAYOUTS = {
    // copies on adjacent disks within the same stripe row
    near(n, chunks) {
      const perRow = n / 2;
      const rows = Math.ceil(chunks / perRow);
      return Array.from({ length: rows }, (_, s) =>
        Array.from({ length: n }, (_, d) => {
          const chunk = s * perRow + Math.floor(d / 2);
          return { role: d % 2 ? 'mirror' : 'data', seg: chunk, seq: chunk };
        }));
    },
    // originals striped (RAID0), then copies in a second section shifted by 1 disk
    far(n, chunks) {
      const R = Math.ceil(chunks / n);
      const origs = Array.from({ length: R }, (_, r) =>
        Array.from({ length: n }, (_, d) => ({ role: 'data', seg: r * n + d, seq: r * n + d })));
      const copies = Array.from({ length: R }, (_, r) =>
        Array.from({ length: n }, (_, d) => {
          const chunk = r * n + ((d - 1 + n) % n);
          return { role: 'mirror', seg: chunk, seq: chunk };
        }));
      return [...origs, ...copies];
    },
    // like far, but each copy row sits immediately below its original row
    offset(n, chunks) {
      const R = Math.ceil(chunks / n);
      const stripes = [];
      for (let r = 0; r < R; r++) {
        stripes.push(Array.from({ length: n }, (_, d) =>
          ({ role: 'data', seg: r * n + d, seq: r * n + d })));
        stripes.push(Array.from({ length: n }, (_, d) => {
          const chunk = r * n + ((d - 1 + n) % n);
          return { role: 'mirror', seg: chunk, seq: chunk };
        }));
      }
      return stripes;
    },
  };
  const DEFAULT_RAID10_LAYOUT = 'near';

  function resolveRaid10Layout(requested) {
    const name = requested ? requested.replace(/^raid10-/, '') : null;
    if (name && RAID10_LAYOUTS[name]) return { algoName: name, fallback: null };
    if (name) return { algoName: DEFAULT_RAID10_LAYOUT,
                       fallback: `unknown RAID10 layout "${requested}" → using ${DEFAULT_RAID10_LAYOUT}` };
    return { algoName: DEFAULT_RAID10_LAYOUT, fallback: null };
  }

  function placeRaid10(n, requested, opts = {}) {
    const { algoName, fallback } = resolveRaid10Layout(requested);
    const chunks = opts.chunks ?? 2 * n;   // 2n chunks → 4 rows at n=4 (matches golden tables)
    const stripes = RAID10_LAYOUTS[algoName](n, chunks);
    return { columns: n, stripes, algorithm: algoName, fallback };
  }

  // --- striped(none) over sub-arrays → nested RAID (1+0 today) ----------------
  // Compose each span's own grid side-by-side; the parent stripe distributes one
  // chunk per span per row (RAID 0 round-robin), so 2-disk mirror spans reproduce
  // `near`. v1: mirror spans only (RAID 1+0). Parity spans (RAID 50/60) deferred.
  function placeNested(node, opts) {
    const children = node.members;
    if (!children.every((c) => c.redundancy === 'mirror'))
      return unsupported('nested placement for parity spans (RAID 50/60) is not implemented yet');

    const grids = children.map((c) => computePlacement(c, opts));
    if (grids.some((g) => g.unsupported))
      return unsupported('every span needs a defined layout to compose the nested grid');

    const k = children.length;
    const rows = Math.max(...grids.map((g) => g.stripes.length));
    const stripes = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let j = 0; j < k; j++) {
        const seg = r * k + j;                 // RAID 0 interleave: one chunk per span per row
        for (const cell of grids[j].stripes[r] || [])
          row.push({ role: cell.role, seg, seq: seg });
      }
      stripes.push(row);
    }
    const columns = grids.reduce((s, g) => s + g.columns, 0);
    return { columns, stripes, algorithm: 'nested 1+0', fallback: null };
  }

  // --- parity1/parity2 → RAID 5/6, rotating parity ----------------------------
  function placeParity(n, pCount, requested, rows) {
    const { algoName, fallback } = resolveParityAlgo(requested);
    const { rotate, symmetric } = PARITY_ALGORITHMS[algoName];

    let seg = 0, t = 0;
    const stripes = [];
    for (let s = 0; s < rows; s++) {
      // Parity anchor: left starts rightmost and moves left; right starts leftmost.
      const anchor = rotate === 'left' ? mod(n - 1 - s, n) : mod(s, n);
      const row = Array.from({ length: n }, () => null);

      // Place parity blocks: P at anchor, Q to the LEFT of P (DDF convention,
      // ALGORITHM_ROTATING_N_CONTINUE in Linux md). This is the hardware RAID /
      // SNIA DDF standard — distinct from mdadm's ALGORITHM_LEFT_SYMMETRIC where
      // Q is to the RIGHT of P. Both are valid; Phase 4 will surface the distinction.
      const parityAt = {};
      const parityCells = [];
      for (let k = 0; k < pCount; k++) {
        const pos = mod(anchor - k, n);
        parityAt[pos] = k === 0 ? 'P' : 'Q';
        row[pos] = { role: parityAt[pos], seg: null, seq: null };
        parityCells.push(row[pos]);
      }

      // Symmetric: data starts immediately right of parity anchor, wrapping.
      // Asymmetric: data always starts at disk 0, fills left-to-right skipping parity.
      let disk = symmetric ? mod(anchor + 1, n) : 0;
      const dataNeeded = n - pCount;
      for (let placed = 0, steps = 0; placed < dataNeeded && steps < n * 2; steps++) {
        if (!(disk in parityAt)) { row[disk] = { role: 'data', seg: seg++, seq: t++ }; placed++; }
        disk = mod(disk + 1, n);
      }

      // Parity lights AFTER the stripe's data (it is computed from it).
      parityCells.forEach((c) => { c.seq = t; });
      t++;

      stripes.push(row);
    }
    return { columns: n, stripes, algorithm: algoName, fallback };
  }

  function resolveParityAlgo(requested) {
    if (requested && PARITY_ALGORITHMS[requested]) return { algoName: requested, fallback: null };
    if (requested) {
      return { algoName: DEFAULT_PARITY_ALGO,
               fallback: `unknown algorithm "${requested}" → using ${DEFAULT_PARITY_ALGO}` };
    }
    return { algoName: DEFAULT_PARITY_ALGO, fallback: null };
  }

  const Layout = { computePlacement, PARITY_ALGORITHMS, RAID10_LAYOUTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Layout;
  else root.RaidLayout = Layout;

})(typeof globalThis !== 'undefined' ? globalThis : this);
