/**
 * validator.test.js — headless tests for the §6 constraint engine.
 * Run with: node validator.test.js
 */

const M = require('./model.js');
const V = require('./validator.js');

let passed = 0, failed = 0;

function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (e) { console.error(`  ✗ ${label}`); console.error(`    ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b) { assert(a === b, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
const hasCode = (list, code) => list.some((v) => v.code === code);

const d = (n = 2, p = 'SATA') => M.disk(`d${Math.random()}`, n, p);
const disks = (k, p = 'SATA') => Array.from({ length: k }, () => d(2, p));

// ---------------------------------------------------------------------------
console.log('\n[1] Minimum disks per level (hard)');

test('RAID 5 with 2 disks → min-disks', () => {
  const r = V.validate(M.array('striped', 'parity1', disks(2)), {});
  assert(hasCode(r.hard, 'min-disks'));
});
test('RAID 5 with 3 disks → clean', () => {
  const r = V.validate(M.array('striped', 'parity1', disks(3)), {});
  assert(!hasCode(r.hard, 'min-disks'));
});
test('RAID 6 with 3 disks → min-disks', () => {
  const r = V.validate(M.array('striped', 'parity2', disks(3)), {});
  assert(hasCode(r.hard, 'min-disks'));
});
test('the min-disks check is recursive — a RAID 50 with a 2-disk span flags it', () => {
  const span = M.array('striped', 'parity1', disks(2));
  const r = V.validate(M.array('striped', 'none', [span, M.array('striped', 'parity1', disks(3))]), {});
  assert(hasCode(r.hard, 'min-disks'));
});

// ---------------------------------------------------------------------------
console.log('\n[2] Mirror even-count (hard)');

test('striped+mirror with 3 disks → mirror-even', () => {
  const r = V.validate(M.array('striped', 'mirror', disks(3)), {});
  assert(hasCode(r.hard, 'mirror-even'));
});
test('striped+mirror with 4 disks → clean', () => {
  const r = V.validate(M.array('striped', 'mirror', disks(4)), {});
  assert(!hasCode(r.hard, 'mirror-even'));
});

// ---------------------------------------------------------------------------
console.log('\n[3] Cross-axis near/far/offset (hard) — §9.7');

test('near layout on hardware RAID → cross-axis', () => {
  const tree = M.array('striped', 'mirror', disks(4), 'near');
  const r = V.validate(tree, { raidType: 'hardware', os: null });
  assert(hasCode(r.hard, 'cross-axis-near-far-offset'));
});
test('near layout on Linux software RAID → clean', () => {
  const tree = M.array('striped', 'mirror', disks(4), 'near');
  const r = V.validate(tree, { raidType: 'software', os: 'os-linux' });
  assert(!hasCode(r.hard, 'cross-axis-near-far-offset'));
});
test('near layout with no control path yet → not flagged (recognizer’s job)', () => {
  const tree = M.array('striped', 'mirror', disks(4), 'near');
  const r = V.validate(tree, { raidType: null });
  assert(!hasCode(r.hard, 'cross-axis-near-far-offset'));
});

// ---------------------------------------------------------------------------
console.log('\n[4] Physical constraints (hard)');

test('NVMe disk wired to backplane → nvme-backplane', () => {
  const tree = M.array('striped', 'none', disks(2));
  const r = V.validate(tree, { diskRoutes: [{ id: 'x', protocol: 'NVMe', target: 'backplane' }] });
  assert(hasCode(r.hard, 'nvme-backplane'));
});
test('NVMe disk on PCIe → clean', () => {
  const tree = M.array('striped', 'none', disks(2));
  const r = V.validate(tree, { diskRoutes: [{ id: 'x', protocol: 'NVMe', target: 'pcie' }] });
  assert(!hasCode(r.hard, 'nvme-backplane'));
});
test('two engine sources → engine-single-point', () => {
  const tree = M.array('striped', 'none', disks(2));
  const r = V.validate(tree, { engineCount: 2 });
  assert(hasCode(r.hard, 'engine-single-point'));
});
test('one engine source → clean', () => {
  const tree = M.array('striped', 'none', disks(2));
  const r = V.validate(tree, { engineCount: 1 });
  assert(!hasCode(r.hard, 'engine-single-point'));
});

// ---------------------------------------------------------------------------
console.log('\n[5] Shape & clean builds');

test('clean RAID 6 → { hard:[], soft:[] }', () => {
  const r = V.validate(M.array('striped', 'parity2', disks(6)), { raidType: 'hardware' });
  eq(r.hard.length, 0);
  eq(r.soft.length, 0);
});
test('validate always returns hard + soft arrays (even with null tree)', () => {
  const r = V.validate(null, {});
  assert(Array.isArray(r.hard) && Array.isArray(r.soft));
});

// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
