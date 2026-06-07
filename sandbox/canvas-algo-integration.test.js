/**
 * canvas-algo-integration.test.js
 * End-to-end: canvas state → algorithm chip → computePlacement → different grids.
 * Run: node canvas-algo-integration.test.js
 */

global.RaidModel  = require('./model.js');
global.RaidLayout = require('./layout.js');
global.CanvasState = require('./canvas-state.js');
const CS = global.CanvasState;
const { test, assert, finish } = require('./test-helpers.js');

// Build a 4-disk RAID5 in canvas state and evaluate with a given algorithm.
function buildAndEval(algo) {
  const s = CS.createState();
  const disks = [0,1,2,3].map(() => CS.addDisk(s, 2, 'SATA'));
  const aid = CS.group(s, disks);
  CS.setSegmentation(s, aid, 'striped');
  CS.setRedundancy(s, aid, 'parity1');
  if (algo !== null) CS.setAlgorithm(s, aid, algo);
  return CS.evaluate(s, { stripes: 4 });
}

// Compact fingerprint of a placement grid (roles + seg numbers).
function fingerprint(placement) {
  return placement.stripes.map(row =>
    row.map(c => c.role === 'data' ? String(c.seg) : c.role).join(',')
  ).join('|');
}

// ── Print all four grids for visual confirmation ──────────────────────────
const ALGOS = ['left-symmetric', 'left-asymmetric', 'right-symmetric', 'right-asymmetric'];
console.log('\n[Visual check — 4 algorithms, 4 disks, 4 stripes]\n');
ALGOS.forEach(algo => {
  const r = buildAndEval(algo);
  console.log(algo + ':');
  r.placement.stripes.forEach((row, s) => {
    const cells = row.map(c => (c.role === 'P' ? 'P ' : c.role === 'Q' ? 'Q ' : String(c.seg).padEnd(2))).join(' ');
    console.log('  stripe ' + s + ': ' + cells);
  });
  console.log();
});

// ── Assertions ────────────────────────────────────────────────────────────
console.log('[Tests]');

test('all four algorithms produce a valid (non-unsupported) placement', () => {
  ALGOS.forEach(algo => {
    const r = buildAndEval(algo);
    assert(r.placement && !r.placement.unsupported,
      algo + ' returned unsupported: ' + (r.placement && r.placement.reason));
  });
});

test('all four algorithms produce distinct grids', () => {
  const prints = ALGOS.map(algo => fingerprint(buildAndEval(algo).placement));
  const unique = new Set(prints);
  assert(unique.size === 4,
    'expected 4 distinct grids, got ' + unique.size);
});

test('algorithm=null defaults to left-symmetric output', () => {
  const rNull = buildAndEval(null);
  const rLS   = buildAndEval('left-symmetric');
  assert(fingerprint(rNull.placement) === fingerprint(rLS.placement),
    'null algorithm did not fall back to left-symmetric');
});

test('left-symmetric and left-asymmetric share parity column positions', () => {
  const ls = buildAndEval('left-symmetric').placement;
  const la = buildAndEval('left-asymmetric').placement;
  // Both are left-rotation: P column per stripe must be identical
  ls.stripes.forEach((row, s) => {
    const lsP = row.findIndex(c => c.role === 'P');
    const laP = la.stripes[s].findIndex(c => c.role === 'P');
    assert(lsP === laP, 'stripe ' + s + ': LS parity at ' + lsP + ' but LA at ' + laP);
  });
});

test('right-symmetric parity column is mirror of left-symmetric', () => {
  const ls = buildAndEval('left-symmetric').placement;
  const rs = buildAndEval('right-symmetric').placement;
  const n = 4;
  ls.stripes.forEach((row, s) => {
    const lsP = row.findIndex(c => c.role === 'P');
    const rsP = rs.stripes[s].findIndex(c => c.role === 'P');
    assert(lsP + rsP === n - 1,
      'stripe ' + s + ': LS=' + lsP + ' RS=' + rsP + ' expected sum=' + (n-1));
  });
});

test('setAlgorithm on RAID6 (parity2) also works', () => {
  const s = CS.createState();
  const disks = [0,1,2,3,4].map(() => CS.addDisk(s, 2, 'SATA'));
  const aid = CS.group(s, disks);
  CS.setSegmentation(s, aid, 'striped');
  CS.setRedundancy(s, aid, 'parity2');
  CS.setAlgorithm(s, aid, 'right-asymmetric');
  const r = CS.evaluate(s, { stripes: 5 });
  assert(r.placement && !r.placement.unsupported, 'RAID6 right-asymmetric unsupported');
  assert(r.placement.algorithm === 'right-asymmetric', 'wrong algo reported: ' + r.placement.algorithm);
  // Verify both P and Q are present
  const roles = r.placement.stripes.flatMap(row => row.map(c => c.role));
  assert(roles.includes('P') && roles.includes('Q'), 'P or Q missing from RAID6 grid');
});

finish();
