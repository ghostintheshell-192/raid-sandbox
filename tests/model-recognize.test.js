/**
 * model-recognize.test.js — headless tests for the level RECOGNIZER (§4).
 * Run with: node model-recognize.test.js
 *
 * Covers the extended-nesting work: RAID 1E (odd striped mirror), RAID 100
 * (stripe over RAID 10, previously misnamed RAID 1+0), and the mirror-of-arrays
 * family (RAID 51/61/0+1). Guardrails assert the pre-existing names are unchanged.
 *
 * Recognition is SHAPE-derived (never the placement algorithm). Capacity/FT are
 * checked alongside to confirm the recursive math already covers these trees.
 */

const M = require('../src/engine/model.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

const disks = (k, size = 2) => Array.from({ length: k }, (_, i) => M.disk(`d${k}_${i}_${size}`, size));
const arr   = (seg, red, members) => M.array(seg, red, members);

const level = (n) => M.recognize(n).level;
const cap   = (n) => M.capacityGB(n);
const ft    = (n) => M.faultTolerance(n);

// --- leaf levels: guardrails (must be unchanged) ---------------------------
console.log('Recognizer — leaf guardrails');
test('RAID 0 stays RAID 0',  () => eq(level(arr('striped', 'none',   disks(3))), 'RAID 0'));
test('JBOD stays JBOD',      () => eq(level(arr('linear',  'none',   disks(3))), 'JBOD / spanned'));
test('RAID 1 stays RAID 1',  () => eq(level(arr('linear',  'mirror', disks(2))), 'RAID 1'));
test('RAID 5 stays RAID 5',  () => eq(level(arr('striped', 'parity1', disks(3))), 'RAID 5'));
test('RAID 6 stays RAID 6',  () => eq(level(arr('striped', 'parity2', disks(4))), 'RAID 6'));
test('RAID 10 (even) stays RAID 10', () => eq(level(arr('striped', 'mirror', disks(4))), 'RAID 10'));

// --- RAID 1E: striped mirror, ODD disk count -------------------------------
console.log('RAID 1E (odd striped mirror)');
const r1e = arr('striped', 'mirror', disks(3));
test('odd striped mirror → RAID 1E', () => eq(level(r1e), 'RAID 1E'));
test('RAID 1E capacity = n/2 disks',  () => eq(cap(r1e), 3));   // 3×2 / 2 copies
test('RAID 1E fault tolerance = 1',   () => eq(ft(r1e), 1));
test('5-disk striped mirror → RAID 1E', () => eq(level(arr('striped', 'mirror', disks(5))), 'RAID 1E'));

// --- nested stripe family --------------------------------------------------
console.log('Nested stripe family');
const raid10span = () => arr('striped', 'mirror', disks(4));   // flat RAID 10 span
const r1plus0 = arr('striped', 'none', [arr('linear', 'mirror', disks(2)), arr('linear', 'mirror', disks(2))]);
const r100    = arr('striped', 'none', [raid10span(), raid10span()]);
const r50     = arr('striped', 'none', [arr('striped', 'parity1', disks(3)), arr('striped', 'parity1', disks(3))]);
const r60     = arr('striped', 'none', [arr('striped', 'parity2', disks(4)), arr('striped', 'parity2', disks(4))]);

test('GUARDRAIL: stripe over mirror pairs stays RAID 1+0', () => eq(level(r1plus0), 'RAID 1+0'));
test('stripe over RAID 10 spans → RAID 100 (not RAID 1+0)', () => eq(level(r100), 'RAID 100'));
test('RAID 100 capacity = 8 (2 spans × 4/2 × 2GB)', () => eq(cap(r100), 8));
test('RAID 100 fault tolerance = 1', () => eq(ft(r100), 1));
test('stripe over RAID 5 spans stays RAID 50', () => eq(level(r50), 'RAID 50'));
test('stripe over RAID 6 spans stays RAID 60', () => eq(level(r60), 'RAID 60'));

// --- nested mirror family (x1) ---------------------------------------------
console.log('Nested mirror family');
const r51 = arr('linear', 'mirror', [arr('striped', 'parity1', disks(3)), arr('striped', 'parity1', disks(3))]);
const r61 = arr('linear', 'mirror', [arr('striped', 'parity2', disks(4)), arr('striped', 'parity2', disks(4))]);
const r01 = arr('linear', 'mirror', [arr('striped', 'none', disks(3)),    arr('striped', 'none', disks(3))]);

test('mirror over RAID 5 spans → RAID 51', () => eq(level(r51), 'RAID 51'));
test('RAID 51 capacity = one leg (R5 usable) = 4', () => eq(cap(r51), 4));   // (3-1)×2
test('RAID 51 fault tolerance = 3', () => eq(ft(r51), 3));                    // each R5 costs 2, mirror sums → 4 to kill
test('mirror over RAID 6 spans → RAID 61', () => eq(level(r61), 'RAID 61'));
test('mirror over RAID 0 spans → RAID 0+1', () => eq(level(r01), 'RAID 0+1'));

// --- recognition must NOT depend on the placement algorithm ----------------
console.log('Algorithm-independence');
test('algorithm does not change the recognized level', () => {
  const a = arr('striped', 'parity1', disks(4));
  a.algorithm = 'right-asymmetric';
  eq(level(a), 'RAID 5');
});

finish();
