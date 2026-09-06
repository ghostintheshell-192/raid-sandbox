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

const M = require('../src/engine/model.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

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

// Nested mirrors, the two nestings of the same 4 (then 8) disks.
const stripeLeg = (k) => M.array('striped', 'none', disks(k));    // a RAID 0 leg
const mirrorPair = () => M.array('linear', 'mirror', disks(2));   // a RAID 1 pair
const RAID0plus1   = M.array('linear',  'mirror', [stripeLeg(2), stripeLeg(2)]);
const RAID1plus0   = M.array('striped', 'none',   [mirrorPair(), mirrorPair()]);
const RAID0plus1_8 = M.array('linear',  'mirror', [stripeLeg(4), stripeLeg(4)]);
const RAID1plus0_8 = M.array('striped', 'none',   [mirrorPair(), mirrorPair(), mirrorPair(), mirrorPair()]);
const RAID51 = M.array('linear', 'mirror', [M.array('striped', 'parity1', disks(3)),
                                            M.array('striped', 'parity1', disks(3))]);
const RAID61 = M.array('linear', 'mirror', [M.array('striped', 'parity2', disks(4)),
                                            M.array('striped', 'parity2', disks(4))]);
const ONEDISK = M.array('striped', 'none', disks(1));

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
console.log('\n[7] Mirror of arrays — a read is served by ANY member, at that member’s width');

// Derivation: a mirror holds identical copies, so a read may go to any leg and
// every leg can be reading at once → readMult = Σ(leg readMult). One read still
// goes to ONE leg, so what it is spread over is that leg's width (2 of 4 here) —
// still > 1, so RAID 0+1 reads in the same class as RAID 1+0, not below it.
test('RAID 0+1 (2 legs × 2-disk stripe) → readMult 2+2 = 4, same as RAID 1+0', () => {
  eq(M.performance(RAID0plus1).random.readMult, 4);
  eq(M.performance(RAID1plus0).random.readMult, 4);
});
test('RAID 0+1 and RAID 1+0 over 4 disks land in the same read class (high)', () => {
  eq(M.analyze(RAID0plus1).readClass, 'high');
  eq(M.analyze(RAID0plus1).readClass, M.analyze(RAID1plus0).readClass);
});
test('RAID 0+1 and RAID 1+0 over 8 disks agree too → readMult 8, read high', () => {
  eq(M.performance(RAID0plus1_8).random.readMult, 8);
  eq(M.performance(RAID1plus0_8).random.readMult, 8);
  eq(M.analyze(RAID0plus1_8).readClass, M.analyze(RAID1plus0_8).readClass);
  eq(M.analyze(RAID0plus1_8).readClass, 'high');
});
// Same rule, parity members: each RAID-5 leg is striped over 3 disks, so a read
// is spread over 3 (> 1 → high) and both legs can serve at once (3+3 = 6).
test('RAID 51 (mirror over 3-disk RAID-5 spans) → readMult 6, read high', () => {
  eq(M.performance(RAID51).random.readMult, 6);
  eq(M.analyze(RAID51).readClass, 'high');
});
test('RAID 61 (mirror over 4-disk RAID-6 spans) → readMult 8, read high', () => {
  eq(M.performance(RAID61).random.readMult, 8);
  eq(M.analyze(RAID61).readClass, 'high');
});
// The other side of the rule: a mirror of DISKS fans copies out but spreads no
// single read (width 1), which is what keeps RAID 1 at medium — see [3].
test('RAID 1 three-way → readMult 3 but still read medium (width stays 1)', () => {
  const R1x3 = M.array('linear', 'mirror', disks(3));
  eq(M.performance(R1x3).random.readMult, 3);
  eq(M.analyze(R1x3).readClass, 'medium');
});
test('a one-disk array reads like the disk it is → high, not low', () => {
  eq(M.analyze(ONEDISK).readClass, 'high');
});

// ---------------------------------------------------------------------------
console.log('\n[8] Mirror of arrays — a write goes to EVERY copy, spread over one copy’s width');

// Derivation (tech-debt/mirror-of-stripes-write-parallelism.md, resolved): the
// copies are the same data, so one write is spread over one leg's width — 2 of
// 4 here — and the penalty charges the copies: W = copies × the leg's own W.
//   RAID 0+1: N 2, W 2 × 1 = 2 → writeMult 1    RAID 1+0: N 1 + 1 = 2, W 2 → 1
test('RAID 0+1 writes like RAID 1+0: parallelism 2, penalty 2, writeMult 1', () => {
  const a = M.performance(RAID0plus1), b = M.performance(RAID1plus0);
  eq(a.parallelism, 2);  eq(a.writePenalty, 2);  eq(a.random.writeMult, 1);
  eq(b.parallelism, 2);  eq(b.writePenalty, 2);  eq(b.random.writeMult, 1);
});
test('RAID 0+1 and RAID 1+0 over 8 disks agree too → parallelism 4, writeMult 2', () => {
  eq(M.performance(RAID0plus1_8).random.writeMult, 2);
  eq(M.performance(RAID1plus0_8).random.writeMult, 2);
});
test('RAID 0+1 lands in the same write class as RAID 1+0 (high) — the database challenge', () => {
  eq(M.analyze(RAID0plus1).writeClass, 'high');
  eq(M.analyze(RAID0plus1).writeClass, M.analyze(RAID1plus0).writeClass);
});
// A mirror of parity spans pays every copy's read-modify-write: RAID 51 → W 2 × 4 = 8
// over one leg's width 3 → 3/8 = 0.375 → low, worse than the RAID 5 it doubles (as it
// should be: twice the work). Sequential amortises the parity: W 2 × 1 = 2 → 1.5, high.
test('RAID 51: penalty 8, parallelism 3, random writeMult 0.38 → low; sequential 1.5 → high', () => {
  const p = M.performance(RAID51);
  eq(p.writePenalty, 8);  eq(p.parallelism, 3);
  eq(p.random.writeMult, 0.38);      eq(p.random.writeClass, 'low');
  eq(p.sequential.writeMult, 1.5);   eq(p.sequential.writeClass, 'high');
});
test('RAID 61: penalty 2 × 6 = 12, parallelism 4 → writeMult 0.33, low', () => {
  const p = M.performance(RAID61);
  eq(p.writePenalty, 12);  eq(p.random.writeMult, 0.33);  eq(p.random.writeClass, 'low');
});
// The same rule on disks: every copy is written, so a three-way mirror pays 3.
test('RAID 1 three-way: penalty 3, writeMult 0.33, still write medium (width stays 1)', () => {
  const R1x3 = M.array('linear', 'mirror', disks(3));
  const p = M.performance(R1x3);
  eq(p.writePenalty, 3);  eq(p.random.writeMult, 0.33);  eq(p.random.writeClass, 'medium');
});

// ---------------------------------------------------------------------------
finish();
