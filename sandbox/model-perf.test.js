/**
 * model-perf.test.js — headless tests for the performance derivation (§4b).
 * Run with: node model-perf.test.js
 *
 * Golden values are hand-computed from the canon write-penalty table
 * (none=1 · mirror=2 · parity1=4 · parity2=6; the parity small-write cost is the
 * Patterson/Gibson/Katz "small-write problem") and the multiplier model
 * read ≈ N×, write ≈ N/W× (relative to one disk). The sequential characterization
 * amortizes parity (W→1) but keeps mirror at W=2 — §4b's "one nuance".
 */

const M = require('./model.js');

let passed = 0, failed = 0;

function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (e) { console.error(`  ✗ ${label}`); console.error(`    ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b) { assert(a === b, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// ---- tree builders (4 equal disks unless stated) --------------------------
const d = (n = 2) => M.disk(`d${Math.random()}`, n);
const disks = (k, n = 2) => Array.from({ length: k }, () => d(n));

const RAID0  = M.array('striped', 'none',    disks(4));
const RAID1  = M.array('linear',  'mirror',  disks(2));
const RAID5  = M.array('striped', 'parity1', disks(4));
const RAID6  = M.array('striped', 'parity2', disks(6));
const RAID10 = M.array('striped', 'mirror',  disks(4));     // flat (even) → copies 2
const JBOD   = M.array('linear',  'none',    disks(3));
const span5  = () => M.array('striped', 'parity1', disks(4));
const span6  = () => M.array('striped', 'parity2', disks(4));
const RAID50 = M.array('striped', 'none', [span5(), span5()]);
const RAID60 = M.array('striped', 'none', [span6(), span6()]);

// ---------------------------------------------------------------------------
console.log('\n[1] Write penalty W (random)');

test('RAID 0 → W=1',  () => eq(M.performance(RAID0).writePenalty, 1));
test('RAID 1 → W=2',  () => eq(M.performance(RAID1).writePenalty, 2));
test('RAID 5 → W=4',  () => eq(M.performance(RAID5).writePenalty, 4));
test('RAID 6 → W=6',  () => eq(M.performance(RAID6).writePenalty, 6));
test('RAID 10 → W=2', () => eq(M.performance(RAID10).writePenalty, 2));
test('RAID 50 inherits the span parity penalty → W=4', () => eq(M.performance(RAID50).writePenalty, 4));
test('RAID 60 inherits double parity → W=6',           () => eq(M.performance(RAID60).writePenalty, 6));

// ---------------------------------------------------------------------------
console.log('\n[2] Parallelism N');

test('RAID 0 (4 disks) → N=4',            () => eq(M.performance(RAID0).parallelism, 4));
test('RAID 1 (linear) → N=1',             () => eq(M.performance(RAID1).parallelism, 1));
test('RAID 10 (4 disks) → N=4',           () => eq(M.performance(RAID10).parallelism, 4));
test('RAID 50 = sum of span widths → N=8',() => eq(M.performance(RAID50).parallelism, 8));
test('JBOD → N=1',                        () => eq(M.performance(JBOD).parallelism, 1));

// ---------------------------------------------------------------------------
console.log('\n[3] Buckets — random read/write class');

test('RAID 0 → read high, write high',  () => { const a = M.analyze(RAID0);  eq(a.readClass, 'high');   eq(a.writeClass, 'high'); });
test('RAID 1 → read medium, write medium', () => { const a = M.analyze(RAID1); eq(a.readClass, 'medium'); eq(a.writeClass, 'medium'); });
test('RAID 5 → read high, write medium',() => { const a = M.analyze(RAID5);  eq(a.readClass, 'high');   eq(a.writeClass, 'medium'); });
test('RAID 6 → read high, write low',   () => { const a = M.analyze(RAID6);  eq(a.readClass, 'high');   eq(a.writeClass, 'low'); });
test('RAID 10 → read high, write high (the DB headline)', () => { const a = M.analyze(RAID10); eq(a.readClass, 'high'); eq(a.writeClass, 'high'); });
test('RAID 50 → write medium',          () => eq(M.analyze(RAID50).writeClass, 'medium'));
test('RAID 60 → write low',             () => eq(M.analyze(RAID60).writeClass, 'low'));
test('JBOD → read low, write low',      () => { const a = M.analyze(JBOD);   eq(a.readClass, 'low');    eq(a.writeClass, 'low'); });

// ---------------------------------------------------------------------------
console.log('\n[4] Multipliers (relative to one disk)');

test('RAID 0 random writeMult = N/W = 4',   () => eq(M.performance(RAID0).random.writeMult, 4));
test('RAID 1 random writeMult = 1/2 = 0.5', () => eq(M.performance(RAID1).random.writeMult, 0.5));
test('RAID 1 readMult fans across 2 copies',() => eq(M.performance(RAID1).random.readMult, 2));
test('RAID 5 random writeMult = 4/4 = 1',   () => eq(M.performance(RAID5).random.writeMult, 1));
test('RAID 10 random writeMult = 4/2 = 2',  () => eq(M.performance(RAID10).random.writeMult, 2));

// ---------------------------------------------------------------------------
console.log('\n[5] Sequential nuance (§4b) — parity penalty amortizes, mirror does not');

test('RAID 5 sequential.writeClass (high) beats random (medium)', () => {
  const p = M.performance(RAID5);
  eq(p.random.writeClass, 'medium');
  eq(p.sequential.writeClass, 'high');
});
test('RAID 6 sequential.writeClass (high) beats random (low)', () => {
  const p = M.performance(RAID6);
  eq(p.random.writeClass, 'low');
  eq(p.sequential.writeClass, 'high');
});
test('RAID 1 sequential.writeClass stays medium (mirror writes both copies)', () => {
  eq(M.performance(RAID1).sequential.writeClass, 'medium');
});

// ---------------------------------------------------------------------------
console.log('\n[6] Flat convenience keys mirror performance.random');

test('analyze().readClass === performance.random.readClass', () => {
  const a = M.analyze(RAID5);
  eq(a.readClass, a.performance.random.readClass);
  eq(a.writeClass, a.performance.random.writeClass);
});

// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
