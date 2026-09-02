/**
 * validator.test.js — headless tests for the §6 constraint engine.
 * Run with: node validator.test.js
 */

const M = require('../src/engine/model.js');
const levels = require('../src/engine/levels.js')
  .createLevels(require('./fixtures/raid-levels.js'));   // the level catalogue: data, mirrored from YAML
// validate() takes the level catalogue as its third argument; the shim passes it
// so every call below reads as before.
const V0 = require('../src/engine/validator.js');
const V  = { ...V0, validate: (tree, physical) => V0.validate(tree, physical, { levels }) };
const { test, assert, eq, finish } = require('./test-helpers.js');
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
console.log('\n[2] striped+mirror: RAID 1E (odd) vs RAID 10 (even)');

test('striped+mirror with 3 disks → clean (valid RAID 1E, not an error)', () => {
  const r = V.validate(M.array('striped', 'mirror', disks(3)), {});
  assert(!hasCode(r.hard, 'mirror-even'), 'odd striped mirror is RAID 1E, no mirror-even');
  assert(!hasCode(r.hard, 'min-disks'),   'RAID 1E min is 3, so 3 disks is fine');
});
test('striped+mirror with 4 disks → clean (RAID 10)', () => {
  const r = V.validate(M.array('striped', 'mirror', disks(4)), {});
  assert(r.hard.length === 0);
});
test('striped+mirror with 2 disks → min-disks (RAID 10 needs 4)', () => {
  const r = V.validate(M.array('striped', 'mirror', disks(2)), {});
  assert(hasCode(r.hard, 'min-disks'));
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
console.log('\n[6] Data-layer soft constraints');

const mixed = (sizes) => sizes.map((gb) => M.disk(`d${gb}${Math.random()}`, gb));

test('RAID 5 over 2+4+4 TB disks → mixed-disk-sizes (soft, not hard)', () => {
  const r = V.validate(M.array('striped', 'parity1', mixed([2, 4, 4])), {});
  assert(hasCode(r.soft, 'mixed-disk-sizes'));
  assert(!hasCode(r.hard, 'mixed-disk-sizes'), 'it warns, it does not block');
});
test('RAID 1 over 2+4 TB disks → mixed-disk-sizes', () => {
  const r = V.validate(M.array('linear', 'mirror', mixed([2, 4])), {});
  assert(hasCode(r.soft, 'mixed-disk-sizes'));
});
test('RAID 5 over equal disks → clean', () => {
  const r = V.validate(M.array('striped', 'parity1', mixed([2, 2, 2])), {});
  assert(!hasCode(r.soft, 'mixed-disk-sizes'));
});
test('RAID 0 over 2+4 TB disks → NOT flagged (md zones the leftover, raid0.c)', () => {
  const r = V.validate(M.array('striped', 'none', mixed([2, 4])), {});
  assert(!hasCode(r.soft, 'mixed-disk-sizes'), 'striping wastes nothing on mixed disks');
});
test('JBOD over 2+4 TB disks → NOT flagged (concatenation uses every sector)', () => {
  const r = V.validate(M.array('linear', 'none', mixed([2, 4])), {});
  assert(!hasCode(r.soft, 'mixed-disk-sizes'));
});
test('the message names the sizes actually on the canvas', () => {
  const r = V.validate(M.array('striped', 'parity1', mixed([2, 4, 4])), {});
  const v = r.soft.find((x) => x.code === 'mixed-disk-sizes');
  assert(v.message.includes('2, 4 TB'), `message was: ${v.message}`);
});

test('two spans mixing sizes produce two DISTINGUISHABLE messages', () => {
  // The in-browser case: RAID 50, each span 2×4 TB + 2×2 TB. Same rule, same
  // wording, two different arrays — the panel has no per-node highlighting, so
  // the message has to name its own subject.
  const span = (id) => M.array('striped', 'parity1', mixed([4, 4, 2, 2]), null, id);
  const r = V.validate(M.array('striped', 'none', [span('s1'), span('s2')], null, 'top'), {});
  const msgs = r.soft.filter((v) => v.code === 'mixed-disk-sizes').map((v) => v.message);
  eq(msgs.length, 2);
  assert(msgs[0] !== msgs[1], `both spans said the same thing: ${msgs[0]}`);
  assert(msgs[0].startsWith('Span 1 '), msgs[0]);
  assert(msgs[1].startsWith('Span 2 '), msgs[1]);
});
test('a top-level array calls itself "This array", not a span', () => {
  const r = V.validate(M.array('striped', 'parity1', mixed([2, 4, 4])), {});
  assert(r.soft[0].message.startsWith('This array mixes'), r.soft[0].message);
});

test('RAID 50 with a 3-disk and a 4-disk span → uneven-spans', () => {
  const span = (n) => M.array('striped', 'parity1', disks(n));
  const r = V.validate(M.array('striped', 'none', [span(3), span(4)]), {});
  assert(hasCode(r.soft, 'uneven-spans'));
});
test('RAID 50 with equal spans → clean', () => {
  const span = () => M.array('striped', 'parity1', disks(3));
  const r = V.validate(M.array('striped', 'none', [span(), span()]), {});
  assert(!hasCode(r.soft, 'uneven-spans'));
});
test('equal disk count but smaller disks still counts as uneven', () => {
  const span = (gb) => M.array('striped', 'parity1', mixed([gb, gb, gb]));
  const r = V.validate(M.array('striped', 'none', [span(2), span(4)]), {});
  assert(hasCode(r.soft, 'uneven-spans'), 'capacity is the metric, not disk count');
});
test('a striped parent says capacity is not lost; a mirror parent says it is', () => {
  const span = (n) => M.array('striped', 'parity1', disks(n));
  const striped = V.validate(M.array('striped', 'none', [span(3), span(4)]), {})
    .soft.find((v) => v.code === 'uneven-spans');
  const mirror  = V.validate(M.array('linear', 'mirror', [span(3), span(4)]), {})
    .soft.find((v) => v.code === 'uneven-spans');
  assert(striped.message.includes('No capacity is lost'), striped.message);
  assert(mirror.message.includes('limited to the smallest span'), mirror.message);
});

// ---------------------------------------------------------------------------
console.log('\n[7] Rule registry');

test('every rule declares a unique code, a valid severity and a valid layer', () => {
  const codes = new Set();
  for (const r of V.RULES) {
    assert(!codes.has(r.code), `duplicate rule code: ${r.code}`);
    codes.add(r.code);
    assert(['hard', 'soft'].includes(r.severity),          `${r.code}: severity ${r.severity}`);
    assert(['data', 'physical', 'cross'].includes(r.layer), `${r.code}: layer ${r.layer}`);
    assert(typeof r.source === 'string' && r.source.length,  `${r.code}: missing source`);
    assert(typeof r.run === 'function',                      `${r.code}: run is not a function`);
  }
});

test('violations are stamped with their rule’s layer', () => {
  const r = V.validate(M.array('striped', 'parity1', disks(2)), { engineCount: 2 });
  eq(r.hard.find((v) => v.code === 'min-disks').layer, 'data');
  eq(r.hard.find((v) => v.code === 'engine-single-point').layer, 'physical');
});

test('two spans failing the same rule stay two violations (distinct nodeId)', () => {
  const bad = (id) => M.array('striped', 'parity1', disks(2), null, id);
  const r = V.validate(M.array('striped', 'none', [bad('a1'), bad('a2')], null, 'top'), {});
  eq(r.hard.filter((v) => v.code === 'min-disks').length, 2);
  eq(r.hard.filter((v) => v.code === 'min-disks').map((v) => v.nodeId).join(','), 'a1,a2');
});

test('the same rule firing twice on the same node is reported once', () => {
  // Same id on both spans is not something the canvas can produce; it is the
  // direct probe of the (code, nodeId) dedup.
  const bad = () => M.array('striped', 'parity1', disks(2), null, 'same');
  const r = V.validate(M.array('striped', 'none', [bad(), bad()], null, 'top'), {});
  eq(r.hard.filter((v) => v.code === 'min-disks').length, 1);
});

test('data-layer rules do not run without a tree, physical rules still do', () => {
  const r = V.validate(null, { engineCount: 2 });
  assert(hasCode(r.hard, 'engine-single-point'), 'physical rule runs with no tree');
  assert(r.hard.every((v) => v.layer === 'physical'), 'no data/cross rule fired');
});

// ---------------------------------------------------------------------------
finish();
