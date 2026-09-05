/**
 * model-normalize.test.js — headless tests for `normalize()` and the two-box
 * `analyze()` (specs/planned/degenerate-levels.md §4, §7, §10 "Recognition").
 * Run with: node model-normalize.test.js
 *
 * What is asserted is HAND-DERIVED from the spec's §3 table and its composition
 * rule, never read off the engine: RAID 5 @2 is a mirror (the kernel says so),
 * RAID 6 @3 a three-way mirror (P = D0, Q = g⁰·D0 = D0), RAID 10 @2 a mirror;
 * a RAID 50 of 2-disk spans is two mirrors striped (RAID 1+0), a RAID 51 of
 * 2-disk spans a mirror of mirrors, i.e. one four-way mirror. The rules the
 * engine applies come from the fixture — the same `collapsesTo` / `absorbsNested`
 * the YAML declares (raid-levels-data.test.js keeps them aligned).
 */

const M = require('../src/engine/model.js');
const L = require('../src/engine/levels.js');
const fixture = require('./fixtures/raid-levels.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

const levels = L.createLevels(fixture);

const disks = (n, prefix = 'd') => Array.from({ length: n }, (_, i) => M.disk(`${prefix}${i}`, 1000));
const arr   = (seg, red, members, algorithm = null, id = null) => M.array(seg, red, members, algorithm, id);
const shape = (n) => `${n.segmentation}+${n.redundancy}/${n.members.length}`;
const traceOf = (t) => t.map((r) => `${r.rule}:${r.level}@${r.nodeId}:${r.from.segmentation}+${r.from.redundancy}/${r.from.members}→${r.to.segmentation}+${r.to.redundancy}/${r.to.members}`).join(' ');

const raid5  = (n, id = null) => arr('striped', 'parity1', disks(n), 'left-symmetric', id);
const raid6  = (n, id = null) => arr('striped', 'parity2', disks(n), 'left-symmetric', id);
const raid10 = (n, id = null) => Object.assign(arr('striped', 'mirror', disks(n), 'near', id), { copies: 2 });

// ---------------------------------------------------------------------------
console.log('\n[1] nothing collapses → empty trace, same tree, box 2 = box 1');

for (const [name, tree] of [
  ['RAID 5 @3',  raid5(3)],
  ['RAID 6 @4',  raid6(4)],
  ['RAID 10 @4', raid10(4)],
  ['RAID 1 @2',  arr('linear', 'mirror', disks(2))],
  ['RAID 50 of 3-disk spans', arr('striped', 'none', [raid5(3), raid5(3)])],
  ['RAID 51 of 3-disk spans', arr('linear', 'mirror', [raid5(3), raid5(3)])],
]) {
  test(`${name}: what you built is what you have`, () => {
    const { tree: out, trace } = M.normalize(tree, levels);
    eq(trace.length, 0);
    eq(JSON.stringify(out), JSON.stringify(tree));
    const a = M.analyze(tree, levels);
    eq(a.runs.level, a.level);
    eq(a.runs.trace.length, 0);
  });
}

test('a single disk normalizes to itself', () => {
  const d = M.disk('x', 1000);
  const { tree, trace } = M.normalize(d, levels);
  eq(tree, d);
  eq(trace.length, 0);
});

test('without a catalogue nothing can collapse — the trace is empty and the numbers are the composed tree\'s', () => {
  const a = M.analyze(raid5(2), null);
  eq(a.runs.trace.length, 0);
  eq(a.performance.writePenalty, 4);
});

// ---------------------------------------------------------------------------
console.log('\n[2] the three cases of spec §3 (leaf collapses)');

test('RAID 5 @2 → a mirror: one rewrite, declared by raid5, id kept, algorithm dropped', () => {
  const { tree, trace } = M.normalize(raid5(2, 'a1'), levels);
  eq(shape(tree), 'linear+mirror/2');
  eq(tree.id, 'a1');
  eq(tree.algorithm, null);
  eq(traceOf(trace), 'collapse:raid5@a1:striped+parity1/2→linear+mirror/2');
  const rule = fixture.levels.find((d) => d.id === 'raid5').collapsesTo[0];
  eq(trace[0].because, rule.because);
  eq(trace[0].source, rule.source);
  eq(M.recognize(tree, levels).level, 'RAID 1');
});

test('RAID 6 @3 → a three-way mirror, declared by raid6', () => {
  const { tree, trace } = M.normalize(raid6(3, 'a2'), levels);
  eq(shape(tree), 'linear+mirror/3');
  eq(traceOf(trace), 'collapse:raid6@a2:striped+parity2/3→linear+mirror/3');
  eq(M.recognize(tree, levels).level, 'RAID 1');
  eq(M.faultTolerance(tree), 2);
});

test('RAID 10 @2 → a mirror, declared by raid10; `copies` does not survive the rewrite', () => {
  const { tree, trace } = M.normalize(raid10(2, 'a3'), levels);
  eq(shape(tree), 'linear+mirror/2');
  eq(tree.copies, undefined);
  eq(traceOf(trace), 'collapse:raid10@a3:striped+mirror/2→linear+mirror/2');
  eq(M.recognize(tree, levels).level, 'RAID 1');
});

test('the disks are the same objects, in the same order', () => {
  const src = raid5(2);
  const { tree } = M.normalize(src, levels);
  assert(tree.members[0] === src.members[0] && tree.members[1] === src.members[1], 'members are shared, not copied');
});

// ---------------------------------------------------------------------------
console.log('\n[3] the collapse composes (spec §3): nested cases follow from the leaf rules');

test('RAID 50 of two 2-disk spans → two mirrors, striped: RAID 1+0, two rewrites, no rule about RAID 50', () => {
  const { tree, trace } = M.normalize(arr('striped', 'none', [raid5(2, 's1'), raid5(2, 's2')], null, 'top'), levels);
  eq(shape(tree), 'striped+none/2');
  eq(tree.members.map(shape).join(' '), 'linear+mirror/2 linear+mirror/2');
  eq(traceOf(trace), 'collapse:raid5@s1:striped+parity1/2→linear+mirror/2 collapse:raid5@s2:striped+parity1/2→linear+mirror/2');
  eq(M.recognize(tree, levels).level, 'RAID 1+0');
});

test('RAID 51 of two 2-disk spans → a mirror of mirrors → one four-way RAID 1: three rewrites, the last absorbs', () => {
  const { tree, trace } = M.normalize(arr('linear', 'mirror', [raid5(2, 's1'), raid5(2, 's2')], null, 'top'), levels);
  eq(shape(tree), 'linear+mirror/4');
  eq(tree.id, 'top');
  eq(traceOf(trace), 'collapse:raid5@s1:striped+parity1/2→linear+mirror/2 collapse:raid5@s2:striped+parity1/2→linear+mirror/2 absorb:raid1@top:linear+mirror/2→linear+mirror/4');
  eq(trace[2].because, fixture.levels.find((d) => d.id === 'raid1').absorbsNested.because);
  eq(M.recognize(tree, levels).level, 'RAID 1');
  eq(M.faultTolerance(tree), 3);
});

test('a mirror of mirrors composed directly (no collapse first) absorbs too', () => {
  const { tree, trace } = M.normalize(arr('linear', 'mirror', [arr('linear', 'mirror', disks(2, 'a')), arr('linear', 'mirror', disks(2, 'b'))]), levels);
  eq(shape(tree), 'linear+mirror/4');
  eq(trace.length, 1);
  eq(trace[0].rule, 'absorb');
});

test('a stripe of stripes does NOT absorb — only a level that declares absorbsNested does', () => {
  const src = arr('striped', 'none', [arr('striped', 'none', disks(2, 'a')), arr('striped', 'none', disks(2, 'b'))]);
  const { tree, trace } = M.normalize(src, levels);
  eq(trace.length, 0);
  eq(JSON.stringify(tree), JSON.stringify(src));
});

test('a mirror over one collapsed span and one intact span stays nested (members must share the shape)', () => {
  const { tree, trace } = M.normalize(arr('linear', 'mirror', [raid5(2, 's1'), raid5(3, 's2')]), levels);
  eq(trace.length, 1);
  eq(shape(tree), 'linear+mirror/2');
  eq(tree.members.map(shape).join(' '), 'linear+mirror/2 striped+parity1/3');
});

// ---------------------------------------------------------------------------
console.log('\n[4] analyze: box 1 is the form, the numbers and box 2 are what runs (spec §7)');

test('RAID 5 @2: box 1 says RAID 5, box 2 says RAID 1, the numbers are a mirror\'s', () => {
  const a = M.analyze(raid5(2, 'a1'), levels);
  eq(a.level, 'RAID 5');
  eq(a.recognized, true);
  eq(a.runs.level, 'RAID 1');
  eq(a.runs.recognized, true);
  eq(a.runs.trace.length, 1);
  eq(shape(a.runs.tree), 'linear+mirror/2');
  eq(a.performance.writePenalty, 2);        // a mirror writes two copies; no read-modify-write
  eq(a.readClass, 'medium');                // one read → one disk; both disks serve readers
  eq(a.capacityGB, 1000);
  eq(a.faultTolerance, 1);
  eq(a.diskCount, 2);
});

test('RAID 6 @3: box 2 is a three-way mirror and the write penalty drops from 6 to 2', () => {
  const a = M.analyze(raid6(3), levels);
  eq(a.level, 'RAID 6');
  eq(a.runs.level, 'RAID 1');
  eq(a.performance.writePenalty, 2);
  eq(a.faultTolerance, 2);
  eq(a.capacityGB, 1000);
});

test('RAID 51 of 2-disk spans: box 1 is RAID 51, box 2 a four-way RAID 1 surviving three failures', () => {
  const a = M.analyze(arr('linear', 'mirror', [raid5(2), raid5(2)]), levels);
  eq(a.level, 'RAID 51');
  eq(a.runs.level, 'RAID 1');
  eq(a.faultTolerance, 3);
  eq(a.runs.trace.length, 3);
});

// ---------------------------------------------------------------------------
console.log('\n[5] the input is never mutated');

test('normalize leaves the composed tree untouched', () => {
  const src = arr('linear', 'mirror', [raid5(2, 's1'), raid10(2, 's2')], null, 'top');
  const before = JSON.stringify(src);
  M.normalize(src, levels);
  M.analyze(src, levels);
  eq(JSON.stringify(src), before);
});

finish();
