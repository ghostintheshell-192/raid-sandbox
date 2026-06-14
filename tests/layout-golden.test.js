/**
 * layout-golden.test.js — golden-table verification for all parity algorithms.
 * Run with: node layout-golden.test.js
 *
 * SOURCING
 * --------
 * left-symmetric: authoritative source = .personal/segment-allocation-rule-left-symmetric.md
 *   (Valentina's verified hand tables). Also the Linux md default (ALGORITHM_LEFT_SYMMETRIC=2).
 *
 * RAID6 Q placement: our implementation puts Q to the LEFT of P — this is the DDF
 * convention (ALGORITHM_ROTATING_N_CONTINUE in Linux md, ddf_layout=1), used by
 * hardware RAID controllers following the SNIA DDF standard. mdadm's default
 * ALGORITHM_LEFT_SYMMETRIC puts Q to the RIGHT of P. Both are valid and present
 * in the Linux kernel. Ours matches the .personal notes (hardware RAID context).
 *
 * left-asymmetric, right-asymmetric, right-symmetric: derived from the same rule pair:
 *   rotate  left  → anchor(s) = (n-1-s) mod n   (parity starts rightmost, moves left)
 *   rotate  right → anchor(s) = s mod n          (parity starts leftmost, moves right)
 *   symmetric     → data from (anchor+1) mod n, wrapping
 *   asymmetric    → data from disk 0, skipping parity
 * These rules are the canonical definitions of ALGORITHM_LEFT_ASYMMETRIC(0),
 * RIGHT_ASYMMETRIC(1), LEFT_SYMMETRIC(2), RIGHT_SYMMETRIC(3) in Linux md/raid5.
 * Left-symmetric is the verified anchor; the other three are derived analytically
 * and are internally consistent with it. They await independent external verification
 * before being exposed in the production UI (per the spec's golden-table protocol).
 *
 * RAID 0, RAID 1, JBOD: trivially correct by inspection (no parity, no rotation).
 */

const M = require('../src/engine/model.js');
const L = require('../src/engine/layout.js');
const { test, assert, finish } = require('./test-helpers.js');

// ---------------------------------------------------------------------------
// Helper: run computePlacement and return a simplified grid for comparison.
// Returns { roles: string[][], segs: (number|null)[][] }
// roles[s][d] = 'P' | 'Q' | 'data'
// segs[s][d]  = segment number (0-based) or null for parity
// ---------------------------------------------------------------------------
function grid(seg, red, n, algo, stripes) {
  const members = Array.from({ length: n }, (_, i) => M.disk('d' + i, 100, 'SATA'));
  const node = M.array(seg, red, members, algo);
  const p = L.computePlacement(node, { stripes: stripes ?? n });
  if (p.unsupported) throw new Error('unsupported: ' + p.reason);
  return {
    roles: p.stripes.map(row => row.map(c => c.role)),
    segs:  p.stripes.map(row => row.map(c => c.seg)),
    algo:  p.algorithm,
    fallback: p.fallback,
  };
}

// ---------------------------------------------------------------------------
// GOLDEN TABLES  (role = 'data' | 'P' | 'Q', seg = 0-based segment number)
// Notation: null = parity (P or Q), number = data segment
// ---------------------------------------------------------------------------

// LEFT-SYMMETRIC, 4 disks, 4 stripes
// Source: .personal/segment-allocation-rule-left-symmetric.md (verified)
const LS4 = {
  roles: [
    ['data','data','data','P'],
    ['data','data','P','data'],
    ['data','P','data','data'],
    ['P','data','data','data'],
  ],
  segs: [
    [0,1,2,null],
    [4,5,null,3],
    [8,null,6,7],
    [null,9,10,11],
  ],
};

// LEFT-ASYMMETRIC, 4 disks, 4 stripes
// Parity: same rotation as left-symmetric (rightmost → moves left)
// Data: always from disk 0, skipping parity
const LA4 = {
  roles: [
    ['data','data','data','P'],
    ['data','data','P','data'],
    ['data','P','data','data'],
    ['P','data','data','data'],
  ],
  segs: [
    [0,1,2,null],
    [3,4,null,5],
    [6,null,7,8],
    [null,9,10,11],
  ],
};

// RIGHT-ASYMMETRIC, 4 disks, 4 stripes
// Parity: leftmost (disk 0) → moves right; data from disk 0, skipping parity
const RA4 = {
  roles: [
    ['P','data','data','data'],
    ['data','P','data','data'],
    ['data','data','P','data'],
    ['data','data','data','P'],
  ],
  segs: [
    [null,0,1,2],
    [3,null,4,5],
    [6,7,null,8],
    [9,10,11,null],
  ],
};

// RIGHT-SYMMETRIC, 4 disks, 4 stripes
// Parity: leftmost → moves right; data from (anchor+1) wrapping
const RS4 = {
  roles: [
    ['P','data','data','data'],
    ['data','P','data','data'],
    ['data','data','P','data'],
    ['data','data','data','P'],
  ],
  segs: [
    [null,0,1,2],
    [5,null,3,4],
    [7,8,null,6],
    [9,10,11,null],
  ],
};

// LEFT-SYMMETRIC, RAID 6 (parity2), 5 disks, 5 stripes
// P at anchor, Q at (anchor-1) mod n — verified vs .personal notes (6-disk table)
const LS5_R6 = {
  roles: [
    ['data','data','data','Q','P'],
    ['data','data','Q','P','data'],
    ['data','Q','P','data','data'],
    ['Q','P','data','data','data'],
    ['P','data','data','data','Q'],
  ],
  segs: [
    [0,1,2,null,null],
    [4,5,null,null,3],
    [8,null,null,6,7],
    [null,null,9,10,11],
    [null,12,13,14,null],
  ],
};

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

console.log('\n[1] left-symmetric');

test('4 disks — parity positions (P column)', () => {
  const g = grid('striped', 'parity1', 4, 'left-symmetric', 4);
  LS4.roles.forEach((row, s) =>
    row.forEach((role, d) => assert(g.roles[s][d] === role,
      `stripe ${s} disk ${d}: got ${g.roles[s][d]}, want ${role}`))
  );
});

test('4 disks — segment numbering', () => {
  const g = grid('striped', 'parity1', 4, 'left-symmetric', 4);
  LS4.segs.forEach((row, s) =>
    row.forEach((seg, d) => assert(g.segs[s][d] === seg,
      `stripe ${s} disk ${d}: got seg ${g.segs[s][d]}, want ${seg}`))
  );
});

test('4 disks — no fallback (left-symmetric is default)', () => {
  const g = grid('striped', 'parity1', 4, null, 4);
  assert(g.fallback === null, 'expected no fallback');
  assert(g.algo === 'left-symmetric', 'expected default algo');
});

test('5 disks RAID 6 — parity and Q positions', () => {
  const g = grid('striped', 'parity2', 5, 'left-symmetric', 5);
  LS5_R6.roles.forEach((row, s) =>
    row.forEach((role, d) => assert(g.roles[s][d] === role,
      `stripe ${s} disk ${d}: got ${g.roles[s][d]}, want ${role}`))
  );
});

test('5 disks RAID 6 — segment numbering', () => {
  const g = grid('striped', 'parity2', 5, 'left-symmetric', 5);
  LS5_R6.segs.forEach((row, s) =>
    row.forEach((seg, d) => assert(g.segs[s][d] === seg,
      `stripe ${s} disk ${d}: got seg ${g.segs[s][d]}, want ${seg}`))
  );
});

// ---------------------------------------------------------------------------
console.log('\n[2] left-asymmetric');

test('4 disks — parity positions identical to left-symmetric', () => {
  const g = grid('striped', 'parity1', 4, 'left-asymmetric', 4);
  LA4.roles.forEach((row, s) =>
    row.forEach((role, d) => assert(g.roles[s][d] === role,
      `stripe ${s} disk ${d}: got ${g.roles[s][d]}, want ${role}`))
  );
});

test('4 disks — data fills from disk 0 (seg 0 always at D0 unless P is there)', () => {
  const g = grid('striped', 'parity1', 4, 'left-asymmetric', 4);
  LA4.segs.forEach((row, s) =>
    row.forEach((seg, d) => assert(g.segs[s][d] === seg,
      `stripe ${s} disk ${d}: got seg ${g.segs[s][d]}, want ${seg}`))
  );
});

test('differs from left-symmetric in stripes where parity is not at D0 or D3', () => {
  const ls = grid('striped', 'parity1', 4, 'left-symmetric', 4);
  const la = grid('striped', 'parity1', 4, 'left-asymmetric', 4);
  // stripe 1: P at D2; LS has D3=3, LA has D3=5 (data ordering differs)
  assert(ls.segs[1][3] !== la.segs[1][3], 'stripe 1 D3 should differ');
  // stripe 2: P at D1; LS has D0=8, LA has D0=6
  assert(ls.segs[2][0] !== la.segs[2][0], 'stripe 2 D0 should differ');
});

// ---------------------------------------------------------------------------
console.log('\n[3] right-asymmetric');

test('4 disks — parity at leftmost, moves right', () => {
  const g = grid('striped', 'parity1', 4, 'right-asymmetric', 4);
  RA4.roles.forEach((row, s) =>
    row.forEach((role, d) => assert(g.roles[s][d] === role,
      `stripe ${s} disk ${d}: got ${g.roles[s][d]}, want ${role}`))
  );
});

test('4 disks — segment numbering', () => {
  const g = grid('striped', 'parity1', 4, 'right-asymmetric', 4);
  RA4.segs.forEach((row, s) =>
    row.forEach((seg, d) => assert(g.segs[s][d] === seg,
      `stripe ${s} disk ${d}: got seg ${g.segs[s][d]}, want ${seg}`))
  );
});

// ---------------------------------------------------------------------------
console.log('\n[4] right-symmetric');

test('4 disks — parity at leftmost, moves right (same as right-asymmetric)', () => {
  const g = grid('striped', 'parity1', 4, 'right-symmetric', 4);
  RS4.roles.forEach((row, s) =>
    row.forEach((role, d) => assert(g.roles[s][d] === role,
      `stripe ${s} disk ${d}: got ${g.roles[s][d]}, want ${role}`))
  );
});

test('4 disks — segment numbering (wraps from after-parity)', () => {
  const g = grid('striped', 'parity1', 4, 'right-symmetric', 4);
  RS4.segs.forEach((row, s) =>
    row.forEach((seg, d) => assert(g.segs[s][d] === seg,
      `stripe ${s} disk ${d}: got seg ${g.segs[s][d]}, want ${seg}`))
  );
});

test('differs from right-asymmetric in interior stripes', () => {
  const ra = grid('striped', 'parity1', 4, 'right-asymmetric', 4);
  const rs = grid('striped', 'parity1', 4, 'right-symmetric',  4);
  // stripe 1: P at D1; RA has D0=3, RS has D0=5
  assert(ra.segs[1][0] !== rs.segs[1][0], 'stripe 1 D0 should differ');
});

// ---------------------------------------------------------------------------
console.log('\n[5] fallback behaviour (unknown algo → left-symmetric + notice)');

test('unknown algorithm falls back gracefully', () => {
  const g = grid('striped', 'parity1', 4, 'nonexistent-algo', 4);
  assert(typeof g.fallback === 'string' && g.fallback.includes('nonexistent-algo'),
    'expected fallback notice');
  assert(g.algo === 'left-symmetric', 'should fall back to default');
});

// ---------------------------------------------------------------------------
console.log('\n[6] cross-checks (parity direction symmetry)');

test('right-symmetric is left-right mirror of left-symmetric (parity columns)', () => {
  const ls = grid('striped', 'parity1', 4, 'left-symmetric', 4);
  const rs = grid('striped', 'parity1', 4, 'right-symmetric', 4);
  // LS parity column per stripe: 3,2,1,0 → RS parity column: 0,1,2,3
  const lsPcol = ls.roles.map(row => row.indexOf('P'));
  const rsPcol = rs.roles.map(row => row.indexOf('P'));
  const n = 4;
  lsPcol.forEach((lsP, s) => assert(rsPcol[s] === n - 1 - lsP,
    `stripe ${s}: LS parity at ${lsP}, RS parity at ${rsPcol[s]} (expected ${n-1-lsP})`));
});

test('all four algorithms produce the same total segment count', () => {
  const n = 5, stripes = 5;
  ['left-symmetric','left-asymmetric','right-asymmetric','right-symmetric'].forEach(algo => {
    const g = grid('striped', 'parity1', n, algo, stripes);
    const count = g.segs.flat().filter(v => v !== null).length;
    const expected = (n - 1) * stripes;
    assert(count === expected, `${algo}: got ${count} segs, expected ${expected}`);
  });
});

// ---------------------------------------------------------------------------
console.log('\n[7] nested placements (RAID 50/60/100/1E) + near generalization');
// SCOPE OF VERIFICATION: the PER-SPAN layout (data/P/Q positions AND the data write
// order) is golden, hand-derived from the Linux md source — raid5.c for parity
// (LEFT_SYMMETRIC and the RAID6 Q-left variant ALGORITHM_ROTATING_N_CONTINUE) and
// raid10.c for near. The expected grids below are computed BY HAND from those rules
// (.personal/golden-raid{50,1e}.md and segment-allocation-rule-left-symmetric.md),
// NOT dumped from the engine (a golden must not test the code against itself).
// The CROSS-SPAN order (which span gets which span-stripe) is a stacking convention
// — the kernel only defines the layout *within* a span — fixed here as: one
// span-stripe per span per round, ascending span order, each span in write order.

const disksOf = (n) => Array.from({ length: n }, (_, i) => M.disk('d' + i, 100));
function placement(node, opts) {
  const p = L.computePlacement(node, opts);
  if (p.unsupported) throw new Error('unsupported: ' + p.reason);
  return {
    roles: p.stripes.map((r) => r.map((c) => c.role)),
    segs:  p.stripes.map((r) => r.map((c) => c.seg)),
    seqs:  p.stripes.map((r) => r.map((c) => c.seq)),
    columns: p.columns,
    algo: p.algorithm,
  };
}
const eqGrid = (got, want, what) => want.forEach((row, s) => row.forEach((v, d) =>
  assert(got[s][d] === v, `${what} stripe ${s} col ${d}: got ${JSON.stringify(got[s][d])}, want ${JSON.stringify(v)}`)));

// RAID 10 near, n=4 — hand-derived from raid10.c near (slot = chunk*near_copies + k,
// dev = slot mod raid_disks, stripe = slot / raid_disks; near_copies=2). Copies on
// adjacent disks. Also the regression guard for the slot-stream rewrite.
test('RAID 10 near n=4 — roles + segs (raid10.c)', () => {
  const g = placement(M.array('striped', 'mirror', disksOf(4), 'near'));
  eqGrid(g.roles, [
    ['data','mirror','data','mirror'], ['data','mirror','data','mirror'],
    ['data','mirror','data','mirror'], ['data','mirror','data','mirror'],
  ], 'near4 roles');
  eqGrid(g.segs, [[0,0,1,1],[2,2,3,3],[4,4,5,5],[6,6,7,7]], 'near4 segs');
});

// RAID 10 far, n=4 — hand-derived from raid10.c far: first copy of every chunk laid
// out as pure RAID 0 (the "near region"), second copies in the "far region" shifted
// by near_copies(=1) device. 8 chunks → 2 orig rows then 2 copy rows.
test('RAID 10 far n=4 — pure-stripe originals, copies shifted +1 disk', () => {
  const g = placement(M.array('striped', 'mirror', disksOf(4), 'far'), { chunks: 8 });
  eqGrid(g.roles, [
    ['data','data','data','data'], ['data','data','data','data'],
    ['mirror','mirror','mirror','mirror'], ['mirror','mirror','mirror','mirror'],
  ], 'far4 roles');
  eqGrid(g.segs, [[0,1,2,3],[4,5,6,7],[3,0,1,2],[7,4,5,6]], 'far4 segs');
});

// RAID 10 offset, n=4 — like far, but each copy row sits immediately below its
// original row (interleaved), same +1 shift.
test('RAID 10 offset n=4 — orig row then its shifted copy row', () => {
  const g = placement(M.array('striped', 'mirror', disksOf(4), 'offset'), { chunks: 8 });
  eqGrid(g.roles, [
    ['data','data','data','data'], ['mirror','mirror','mirror','mirror'],
    ['data','data','data','data'], ['mirror','mirror','mirror','mirror'],
  ], 'offset4 roles');
  eqGrid(g.segs, [[0,1,2,3],[3,0,1,2],[4,5,6,7],[7,4,5,6]], 'offset4 segs');
});

// RAID 1E — striped mirror, ODD disks (n=3). Source: .personal/golden-raid1e.md
test('RAID 1E n=3 — interleaved mirror roles + segs', () => {
  const g = placement(M.array('striped', 'mirror', disksOf(3)));
  eqGrid(g.roles, [
    ['data','mirror','data'], ['mirror','data','mirror'],
    ['data','mirror','data'], ['mirror','data','mirror'],
  ], '1E roles');
  eqGrid(g.segs, [[0,0,1],[1,2,2],[3,3,4],[4,5,5]], '1E segs');
});
test('RAID 1E — every chunk and its copy sit on different disks', () => {
  const g = placement(M.array('striped', 'mirror', disksOf(3)));
  const seen = new Map();   // seg -> set of disk columns
  g.segs.forEach((row) => row.forEach((seg, d) => {
    if (!seen.has(seg)) seen.set(seg, new Set());
    seen.get(seg).add(d);
  }));
  for (const [seg, cols] of seen) assert(cols.size === 2, `chunk ${seg} must use 2 distinct disks, got ${cols.size}`);
});

// RAID 50 — stripe over 2×(3-disk RAID5 LS). Source: .personal/golden-raid50.md
const span5 = () => M.array('striped', 'parity1', disksOf(3), 'left-symmetric');
test('RAID 50 — roles (per-span LS preserved, P null seg)', () => {
  const g = placement(M.array('striped', 'none', [span5(), span5()]), { stripes: 3 });
  eqGrid(g.roles, [
    ['data','data','P','data','data','P'],
    ['data','P','data','data','P','data'],
    ['P','data','data','P','data','data'],
  ], 'r50 roles');
});
// Exact global numbering, hand-derived: within each 3-disk RAID5 span the data is
// written right after P, wrapping (left-symmetric); the outer RAID 0 gives span A
// stripe r then span B stripe r. So stripe1 disk D3 (right after P@D2) holds the
// LOWER seg (4), not D1 — the write-order property the engine must preserve.
test('RAID 50 — exact data numbering (write order, hand-derived from raid5.c LS)', () => {
  const g = placement(M.array('striped', 'none', [span5(), span5()]), { stripes: 3 });
  eqGrid(g.segs, [
    [0, 1, null, 2, 3, null],
    [5, null, 4, 7, null, 6],
    [null, 8, 9, null, 10, 11],
  ], 'r50 segs');
});
test('RAID 50 — data animates ONE AT A TIME, in write order; parity after its data', () => {
  const g = placement(M.array('striped', 'none', [span5(), span5()]), { stripes: 3 });
  const data = [];
  g.segs.forEach((row, r) => row.forEach((seg, d) => {
    if (seg !== null) data.push({ seg, seq: g.seqs[r][d] });
  }));
  // one at a time: every data block has a distinct seq
  const seqs = data.map((x) => x.seq);
  assert(new Set(seqs).size === seqs.length, 'each data block must have a distinct seq');
  // write order: ordering by seg matches ordering by seq (monotonic)
  const bySeg = [...data].sort((a, b) => a.seg - b.seg);
  for (let i = 1; i < bySeg.length; i++)
    assert(bySeg[i].seq > bySeg[i - 1].seq, `data seg ${bySeg[i].seg} must light after seg ${bySeg[i-1].seg}`);
  // parity of each row lights only after that row's first data (causal)
  g.roles.forEach((row, r) => {
    const dataSeqs = row.map((role, d) => role === 'data' ? g.seqs[r][d] : null).filter((v) => v !== null);
    row.forEach((role, d) => {
      if (role === 'P' || role === 'Q')
        assert(g.seqs[r][d] > Math.min(...dataSeqs), `r50 parity at stripe ${r} col ${d} must follow its data`);
    });
  });
});

// RAID 60 — stripe over 2×(6-disk RAID6 LS). Roles cross-checked against the
// hand-verified table in .personal/segment-allocation-rule-left-symmetric.md.
const span6 = () => M.array('striped', 'parity2', disksOf(6), 'left-symmetric');
test('RAID 60 — per-span roles match the .personal hand table (Q left of P, DDF)', () => {
  const g = placement(M.array('striped', 'none', [span6(), span6()]), { stripes: 3 });
  eqGrid(g.roles, [
    ['data','data','data','data','Q','P','data','data','data','data','Q','P'],
    ['data','data','data','Q','P','data','data','data','data','Q','P','data'],
    ['data','data','Q','P','data','data','data','data','Q','P','data','data'],
  ], 'r60 roles');
});
// Exact numbering hand-derived from raid5.c ALGORITHM_ROTATING_N_CONTINUE (Q left of
// P, data after P) + the cross-span convention. Matches the corrected canonical table
// in .personal/segment-allocation-rule-left-symmetric.md (NOT the old hand version,
// whose row 3 was disk-order and whose row 2 had the spans swapped).
test('RAID 60 — exact data numbering (write order + cross-span convention)', () => {
  const g = placement(M.array('striped', 'none', [span6(), span6()]), { stripes: 3 });
  eqGrid(g.segs, [
    [0, 1, 2, 3, null, null, 4, 5, 6, 7, null, null],
    [9, 10, 11, null, null, 8, 13, 14, 15, null, null, 12],
    [18, 19, null, null, 16, 17, 22, 23, null, null, 20, 21],
  ], 'r60 segs');
});

// RAID 100 — stripe over 2×(4-disk RAID10 near). Source: .personal/golden-raid100.md
const span10 = () => M.array('striped', 'mirror', disksOf(4));
test('RAID 100 — roles all data/mirror, label nested 1+0+0', () => {
  const g = placement(M.array('striped', 'none', [span10(), span10()]));
  assert(g.algo === 'nested 1+0+0', `expected nested 1+0+0, got ${g.algo}`);
  assert(g.columns === 8, `expected 8 columns, got ${g.columns}`);
  g.roles.forEach((row, r) => assert(
    JSON.stringify(row) === JSON.stringify(['data','mirror','data','mirror','data','mirror','data','mirror']),
    `r100 row ${r} roles: ${JSON.stringify(row)}`));
});
test('RAID 100 — original and copy of each chunk share a seg, on different disks', () => {
  const g = placement(M.array('striped', 'none', [span10(), span10()]));
  g.segs.forEach((row, r) => {
    for (let d = 0; d < row.length; d += 2)
      assert(row[d] === row[d + 1], `r100 stripe ${r}: cols ${d},${d+1} should share seg`);
  });
});

// GUARDRAIL — RAID 1+0 (2-disk mirror spans) numbering unchanged.
test('GUARDRAIL: RAID 1+0 placement (2-disk mirror spans) unchanged', () => {
  const pair = () => M.array('linear', 'mirror', disksOf(2));
  const g = placement(M.array('striped', 'none', [pair(), pair()]), { stripes: 2 });
  assert(g.algo === 'nested 1+0', `expected nested 1+0, got ${g.algo}`);
  eqGrid(g.roles, [['data','mirror','data','mirror'],['data','mirror','data','mirror']], '1+0 roles');
  eqGrid(g.segs,  [[0,0,1,1],[2,2,3,3]], '1+0 segs');
});

// Structural cross-checks
test('nested column count = sum of span columns', () => {
  const g = placement(M.array('striped', 'none', [span5(), span5()]), { stripes: 3 });
  assert(g.columns === 6, `expected 6, got ${g.columns}`);
});

// ---------------------------------------------------------------------------
finish();
