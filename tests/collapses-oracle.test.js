/**
 * collapses-oracle.test.js — the content algebra (engine/content.js) against the
 * declared `collapsesTo` rules, in both directions (degenerate-levels §6, §10).
 * Run with: node collapses-oracle.test.js
 *
 * Two derivations that must agree, produced in opposite ways: the level files
 * DECLARE what a level becomes below its minimum (a human wrote the sentence and
 * the source); the algebra DERIVES it from the placement grid and the symbolic
 * content of every cell. The test enumerates every leaf level at every width
 * from 2 up to a little past its minimum, and fails naming:
 *
 *   - every collapse the algebra finds with no `collapsesTo` declaring it;
 *   - every `collapsesTo` the algebra contradicts;
 *   - and, at and above the minimum, any level the algebra does not read as itself.
 *
 * Golden discipline: the algebra never GENERATES a rule. It prints what it found
 * so a human can write the sentence and the source; the file is the truth.
 */

const M = require('../src/engine/model.js');
const L = require('../src/engine/levels.js');
const C = require('../src/engine/content.js');
const fixture = require('./fixtures/raid-levels.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

const levels = L.createLevels(fixture);
const disks  = (n) => Array.from({ length: n }, (_, i) => M.disk(`d${i}`, 1000));
const leafOf = (shape, n, algorithm = null) => {
  const node = M.array(shape.segmentation, shape.redundancy, disks(n), algorithm);
  if (shape.copies) node.copies = shape.copies;
  return node;
};
const sr = (s) => (s ? `${s.segmentation}+${s.redundancy}` : 'nothing');

// ---------------------------------------------------------------------------
console.log('\n[1] the contents themselves — the facts the algebra rests on');

test('P of a stripe holding one data block IS that block (RAID 5 @2)', () => {
  const grid = C.contents(require('../src/engine/layout.js').computePlacement(leafOf({ segmentation: 'striped', redundancy: 'parity1' }, 2)));
  for (const row of grid) {
    const keys = row.map(C.key);
    eq(keys[0], keys[1]);                       // the two cells of every stripe hold the same content
    assert(row.every(C.isSingleBlock), 'each is a single block');
  }
});

test('P and Q of a stripe holding one data block are both that block (RAID 6 @3)', () => {
  const grid = C.contents(require('../src/engine/layout.js').computePlacement(leafOf({ segmentation: 'striped', redundancy: 'parity2' }, 3)));
  for (const row of grid) {
    const keys = new Set(row.map(C.key));
    eq(keys.size, 1);
  }
});

test('P over two data blocks is NOT a copy of either, and Q differs from P (RAID 6 @4)', () => {
  const grid = C.contents(require('../src/engine/layout.js').computePlacement(leafOf({ segmentation: 'striped', redundancy: 'parity2' }, 4)));
  const row = grid[0];
  const multi = row.filter((c) => !C.isSingleBlock(c));
  eq(multi.length, 2);
  assert(C.key(multi[0]) !== C.key(multi[1]), 'P and Q carry different coefficients');
});

test('far is a mirror by content: with 2 disks every disk holds every segment', () => {
  for (const algo of ['near', 'far', 'offset']) {
    const b = C.behaviour(leafOf({ segmentation: 'striped', redundancy: 'mirror', copies: 2 }, 2, algo));
    eq(`${algo}: ${sr(b.shape)}`, `${algo}: linear+mirror`);
    eq(b.copies.min, 2);
  }
});

test('RAID 6 @2 holds no data at all — the algebra claims no shape', () => {
  const b = C.behaviour(leafOf({ segmentation: 'striped', redundancy: 'parity2' }, 2));
  eq(b.shape, null);
  eq(b.segments, 0);
});

// ---------------------------------------------------------------------------
console.log('\n[2] the oracle: every leaf level, every width, algebra vs declared');

const leaves = levels.order.filter((d) => d.shape.members === 'disks');
const found  = [];   // what the algebra says collapses — printed at the end

for (const def of leaves) {
  const declaredAt = (n) => (def.collapsesTo || []).find((c) => c.disks === n) || null;
  for (let n = 2; n <= def.minDisks + 2; n++) {
    const node = leafOf(def.shape, n, def.defaultAlgorithm || null);
    if (!levels.matchShape(node, def.shape)) continue;          // this width is another level's
    const b = C.behaviour(node);
    const own = sr(def.shape);
    const got = sr(b.shape);
    const declared = declaredAt(n);

    if (n >= def.minDisks) {
      test(`${def.id} @${n}: at or above its minimum the algebra reads the level as itself (${own})`, () => {
        eq(got, own);
        assert(!declared, `${def.id} declares a collapse at ${n}, which is not below minDisks`);
      });
      continue;
    }

    if (b.shape === null) {
      test(`${def.id} @${n}: ${b.note} — nothing to declare`, () => {
        assert(!declared, `${def.id} @${n} declares a collapse to ${sr(declared && declared.becomes)} but the algebra finds no data`);
      });
      continue;
    }

    if (got !== own) {
      found.push(`${def.id} @${n} → ${got}`);
      test(`${def.id} @${n}: the algebra finds ${got}; collapsesTo must declare exactly that`, () => {
        assert(declared, `the algebra finds a collapse (${def.id} @${n} → ${got}) that no collapsesTo entry declares`);
        eq(sr(declared.becomes), got);
      });
    } else {
      test(`${def.id} @${n}: still ${own} by content; no collapsesTo may claim otherwise`, () => {
        assert(!declared, `${def.id} @${n} declares a collapse to ${sr(declared.becomes)} that the algebra contradicts (it is still ${own})`);
      });
    }
  }
}

test('the declared rules are exactly the collapses the algebra finds (nothing undeclared, nothing invented)', () => {
  const declared = leaves.flatMap((d) => (d.collapsesTo || []).map((c) => `${d.id} @${c.disks} → ${sr(c.becomes)}`));
  eq(found.sort().join(' | '), declared.sort().join(' | '));
});

console.log('\n  what the algebra found:');
for (const f of found) console.log(`    ${f}`);

finish();
