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
finish();
