/**
 * levels.test.js — headless tests for the level catalogue and the shape matcher
 * (engine/levels.js). Run with: node levels.test.js
 *
 * The matcher is exercised with a made-up catalogue so the grammar is tested on
 * its own; the REAL levels are covered by raid-levels-data.test.js (against the
 * YAML) and by model-recognize.test.js / levels-oracle.test.js (through the
 * fixture).
 */

const M = require('../src/engine/model.js');
const L = require('../src/engine/levels.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

const disks = (k) => Array.from({ length: k }, (_, i) => M.disk(`d${i}`, 2));
const arr   = (seg, red, members) => M.array(seg, red, members);

const manifest = () => ({ levels: [
  { id: 'a', name: 'Level A', reason: 'flat, {n} members', minDisks: 2,
    shape: { segmentation: 'striped', redundancy: 'none', members: 'disks' } },
  { id: 'b-even', name: 'Level B (even)', reason: 'even', minDisks: 4,
    shape: { segmentation: 'striped', redundancy: 'mirror', members: 'disks', constraint: 'even-disk-count' } },
  { id: 'b-odd', name: 'Level B (odd)', reason: 'odd', minDisks: 3,
    shape: { segmentation: 'striped', redundancy: 'mirror', members: 'disks', constraint: 'odd-disk-count' } },
  { id: 'nested', name: 'Level A over B', reason: 'nested', minDisks: 8,
    shape: { segmentation: 'striped', redundancy: 'none', members: 'arrays',
             childShape: { segmentation: 'striped', redundancy: 'mirror', members: 'disks', constraint: 'even-disk-count' } } },
] });

// ---------------------------------------------------------------------------
console.log('\n[1] assemble: index + files → manifest, in index order');

test('assemble keeps index order and checks id/name agreement', () => {
  const index = [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }];
  const files = { x: { id: 'x', name: 'X' }, y: { id: 'y', name: 'Y' } };
  eq(L.assemble(index, files).levels.map((d) => d.id).join(','), 'x,y');
  let err = null;
  try { L.assemble(index, { x: files.x, y: { id: 'y', name: 'Why' } }); } catch (e) { err = e; }
  assert(err && /name "Why" does not match/.test(err.message), err && err.message);
});

// ---------------------------------------------------------------------------
console.log('\n[2] a malformed manifest fails fast, naming the piece');

const failsWith = (mutate, re) => {
  const m = manifest();
  mutate(m);
  let err = null;
  try { L.createLevels(m); } catch (e) { err = e; }
  assert(err, 'expected createLevels to throw');
  assert(re.test(err.message), err.message);
};

test('an unknown segmentation', () => failsWith((m) => { m.levels[0].shape.segmentation = 'diagonal'; }, /a: shape\.segmentation "diagonal"/));
test('an unknown constraint',   () => failsWith((m) => { m.levels[1].shape.constraint = 'prime'; }, /b-even: shape\.constraint "prime"/));
test('members: arrays without a childShape', () => failsWith((m) => { delete m.levels[3].shape.childShape; }, /nested: members: arrays needs a childShape/));
test('a childShape on a leaf shape', () => failsWith((m) => { m.levels[0].shape.childShape = m.levels[1].shape; }, /a: childShape only makes sense/));
test('a missing reason',      () => failsWith((m) => { delete m.levels[0].reason; }, /a: reason is required/));
test('a duplicate id',        () => failsWith((m) => { m.levels.push({ ...m.levels[0] }); }, /duplicate level id "a"/));

// ---------------------------------------------------------------------------
console.log('\n[3] matching: leaf, constraint, nested, order');

test('a leaf shape matches on both attributes and all-disk members', () => {
  const lv = L.createLevels(manifest());
  eq(lv.match(arr('striped', 'none', disks(3))).id, 'a');
  eq(lv.match(arr('linear',  'none', disks(3))), null);           // no such shape
  eq(lv.match(arr('striped', 'none', [])), null);                 // no members, no shape
});

test('the disk-count constraint tells two shapes apart', () => {
  const lv = L.createLevels(manifest());
  eq(lv.match(arr('striped', 'mirror', disks(4))).id, 'b-even');
  eq(lv.match(arr('striped', 'mirror', disks(5))).id, 'b-odd');
});

test('a nested shape needs EVERY member to match the child shape', () => {
  const lv = L.createLevels(manifest());
  const even = () => arr('striped', 'mirror', disks(4));
  const odd  = () => arr('striped', 'mirror', disks(3));
  eq(lv.match(arr('striped', 'none', [even(), even()])).id, 'nested');
  eq(lv.match(arr('striped', 'none', [even(), odd()])), null);   // one span is the other level
  eq(lv.match(arr('striped', 'none', [even(), M.disk('x', 2)])), null);   // mixed disks and arrays
});

test('a disk never matches, and reasonFor fills {n}', () => {
  const lv = L.createLevels(manifest());
  eq(lv.match(M.disk('x', 2)), null);
  eq(lv.reasonFor(lv.get('a'), arr('striped', 'none', disks(3))), 'flat, 3 members');
});

test('ids come back in manifest order and get() is null for a stranger', () => {
  const lv = L.createLevels(manifest());
  eq(lv.ids().join(','), 'a,b-even,b-odd,nested');
  eq(lv.get('zzz'), null);
});

finish();
