/**
 * raid-levels-data.test.js — validates the REAL raid-levels YAML files and keeps
 * the headless fixture aligned with them.
 * Run with: node raid-levels-data.test.js   (uses python3 + pyyaml to read YAML;
 * this repo is zero-dependency and Node has no YAML parser, so python is the reader.)
 *
 * Four guards:
 *   1. the manifest (index.yaml + every listed file) builds a level catalogue
 *      through the SAME assemble/createLevels the browser uses — a shape with a
 *      typo, a missing reason, a nested level without a childShape all fail
 *      HERE instead of shipping as a level nobody can build;
 *   2. the domain invariants the files must keep (parity levels name a default
 *      algorithm, fault tolerance 0 only without redundancy, …);
 *   3. tests/fixtures/raid-levels.js mirrors the YAML on every field the engine
 *      reads, so the browser (YAML) and Node (fixture) can never name shapes
 *      differently;
 *   4. `reference.faultToleranceAtMinimum` — a number a human wrote, not a field
 *      the engine reads (tech-debt/level-numbers-duplicated-untested.md) — agrees
 *      with what model.js DERIVES for the smallest tree each shape allows at
 *      minDisks. This is the one place that comparison happens; nothing else
 *      checks the `reference` block against the engine;
 *   5. the collapse keys (specs/planned/degenerate-levels.md §5): every leaf level
 *      says what the real system still starts (`minDisksToRun`, with its source),
 *      every width that runs below `minDisks` has a `collapsesTo` entry — the
 *      COVERAGE rule — and the three cases of spec §3 read as the spec says.
 *      The shape/type checks on those keys are levels.js's (createLevels fails
 *      on them in [1]); this file adds what only the real files can be held to.
 */

const path = require('path');
const { execFileSync } = require('child_process');
const L = require('../src/engine/levels.js');
const M = require('../src/engine/model.js');
const fixture = require('./fixtures/raid-levels.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

const dir = path.join(__dirname, '..', 'data', 'raid-levels');
const PY = `
import yaml, json, os, sys
base = sys.argv[1]
with open(os.path.join(base, 'index.yaml')) as fh: index = yaml.safe_load(fh)
files = {}
for f in sorted(os.listdir(base)):
    if f.endswith('.yaml') and f != 'index.yaml':
        with open(os.path.join(base, f)) as fh: files[f[:-5]] = yaml.safe_load(fh)
print(json.dumps({ 'index': index, 'files': files }))
`;
let data;
try {
  data = JSON.parse(execFileSync('python3', ['-c', PY, dir], { encoding: 'utf8' }));
} catch (e) {
  console.error('Could not read raid-levels YAML via python3/pyyaml:', e.message);
  process.exit(1);
}
const { index, files } = data;

// ---------------------------------------------------------------------------
console.log('\n[1] index.yaml and the level files agree, and build a catalogue');

test('index.yaml is a non-empty list of { id, name }', () => {
  assert(Array.isArray(index) && index.length > 0, 'index must be a non-empty list');
  for (const e of index) assert(e.id && e.name, `index entry needs id and name: ${JSON.stringify(e)}`);
});

test('every indexed level has a file, and every file is indexed', () => {
  const indexed = new Set(index.map((e) => e.id));
  for (const id of indexed) assert(files[id], `${id} is indexed but ${id}.yaml is missing`);
  for (const id of Object.keys(files)) assert(indexed.has(id), `${id}.yaml exists but is not in index.yaml`);
});

let levels = null;
test('the real manifest builds a level catalogue (assemble + createLevels)', () => {
  levels = L.createLevels(L.assemble(index, files));
  eq(levels.ids().length, index.length);
});

for (const e of index) {
  test(`${e.id}.yaml: id and name match the index`, () => {
    eq(files[e.id].id, e.id);
    eq(files[e.id].name, e.name);
  });
}

// ---------------------------------------------------------------------------
console.log('\n[2] RAID level domain invariants');

const docs = index.map((e) => files[e.id]);

test('every level declares reference.faultToleranceAtMinimum and reference.capacityFormula', () => {
  for (const d of docs) {
    assert(d.reference && typeof d.reference === 'object', `${d.id}: reference block`);
    assert(typeof d.reference.faultToleranceAtMinimum === 'number', `${d.id}: reference.faultToleranceAtMinimum`);
    assert(typeof d.reference.capacityFormula === 'string' && d.reference.capacityFormula, `${d.id}: reference.capacityFormula`);
  }
});

test('parity levels (parity1/parity2 leaves) have defaultAlgorithm set', () => {
  for (const d of docs) {
    const s = d.shape;
    if (s.members === 'disks' && (s.redundancy === 'parity1' || s.redundancy === 'parity2'))
      assert(d.defaultAlgorithm, `${d.id}: parity level needs a defaultAlgorithm`);
  }
});

test('flat mirror levels (striped+mirror leaves) have defaultAlgorithm set', () => {
  for (const d of docs) {
    const s = d.shape;
    if (s.members === 'disks' && s.segmentation === 'striped' && s.redundancy === 'mirror')
      assert(d.defaultAlgorithm, `${d.id}: flat mirror level needs a defaultAlgorithm`);
  }
});

test('leaf levels with no placement algorithm (not parity, not flat mirror) have noAlgorithmReason set', () => {
  for (const d of docs) {
    const s = d.shape;
    const isParity     = s.redundancy === 'parity1' || s.redundancy === 'parity2';
    const isFlatMirror = s.segmentation === 'striped' && s.redundancy === 'mirror';
    if (s.members === 'disks' && !isParity && !isFlatMirror)
      assert(typeof d.noAlgorithmReason === 'string' && d.noAlgorithmReason,
        `${d.id}: leaf level with no algorithm axis needs a noAlgorithmReason`);
  }
});

test('faultToleranceAtMinimum == 0 only for none-redundancy leaf levels', () => {
  for (const d of docs)
    if (d.reference.faultToleranceAtMinimum === 0)
      assert(d.shape.redundancy === 'none', `${d.id}: faultToleranceAtMinimum 0 but redundancy is "${d.shape.redundancy}"`);
});

test('no two levels share a shape (the first match would shadow the second forever)', () => {
  const seen = new Map();
  for (const d of docs) {
    const key = JSON.stringify(d.shape);
    assert(!seen.has(key), `${d.id} and ${seen.get(key)} declare the same shape`);
    seen.set(key, d.id);
  }
});

test('notRaid is set exactly on the levels that are not RAID', () => {
  for (const d of docs) assert(typeof d.notRaid === 'boolean', `${d.id}: notRaid must be a boolean`);
  assert(docs.some((d) => d.notRaid), 'at least one level (JBOD) is not RAID');
});

// ---------------------------------------------------------------------------
console.log('\n[3] the headless fixture mirrors the YAML');

const modelFields = (d) => JSON.stringify({
  id: d.id, name: d.name, notRaid: !!d.notRaid, reason: d.reason, shape: d.shape, minDisks: d.minDisks,
  advisory: d.advisory,
  minDisksToRun: d.minDisksToRun, minDisksToRunSource: d.minDisksToRunSource, collapsesTo: d.collapsesTo,
  absorbsNested: d.absorbsNested,
});

test('same level ids, same order', () => {
  eq(fixture.levels.map((d) => d.id).join(','), index.map((e) => e.id).join(','));
});

for (const d of docs) {
  test(`${d.id}: name, notRaid, reason, shape, minDisks, advisory and the collapse keys match the YAML`, () => {
    const mirror = fixture.levels.find((x) => x.id === d.id);
    assert(mirror, `fixture has no "${d.id}"`);
    eq(modelFields(mirror), modelFields(d));
  });
}

// ---------------------------------------------------------------------------
console.log('\n[4] reference.faultToleranceAtMinimum agrees with the engine');

// Builds the smallest tree `shape` allows with `total` physical disks: a leaf
// shape (members: disks) is just `total` disks; a nested shape (members: arrays)
// splits into the smallest number of spans a shape can name — 2 — the count every
// nested level's minDisks comment in the YAML already assumes (e.g. RAID 50 at 6
// disks = two 3-disk RAID-5 spans).
function smallestTree(shape, total) {
  const disks = (n) => Array.from({ length: n }, (_, i) => M.disk(`d${i}`, 100));
  if (shape.members === 'disks') {
    const node = M.array(shape.segmentation, shape.redundancy, disks(total));
    if (shape.copies) node.copies = shape.copies;   // flat RAID 10 / RAID 1E (§3a)
    return node;
  }
  const spans = 2;
  assert(total % spans === 0, `minDisks ${total} does not split into ${spans} equal spans`);
  const members = Array.from({ length: spans }, () => smallestTree(shape.childShape, total / spans));
  return M.array(shape.segmentation, shape.redundancy, members);
}

for (const d of docs) {
  test(`${d.id}: reference.faultToleranceAtMinimum matches the engine at minDisks (${d.minDisks})`, () => {
    const tree = smallestTree(d.shape, d.minDisks);
    eq(M.faultTolerance(tree), d.reference.faultToleranceAtMinimum);
  });
}

// ---------------------------------------------------------------------------
console.log('\n[5] the two minimums and collapsesTo (specs/planned/degenerate-levels.md §5)');

const leaves = docs.filter((d) => d.shape.members === 'disks');
const nested = docs.filter((d) => d.shape.members === 'arrays');
const disksOf = (n) => Array.from({ length: n }, (_, i) => M.disk(`d${i}`, 100));

test('every leaf level declares minDisksToRun with its source', () => {
  for (const d of leaves) {
    assert(Number.isInteger(d.minDisksToRun), `${d.id}: minDisksToRun is missing`);
    assert(typeof d.minDisksToRunSource === 'string' && d.minDisksToRunSource, `${d.id}: minDisksToRunSource is missing`);
  }
});

test('no nested level declares a collapse key — its spans carry the rule (spec §3)', () => {
  for (const d of nested)
    for (const key of ['minDisksToRun', 'minDisksToRunSource', 'collapsesTo', 'absorbsNested'])
      assert(d[key] === undefined, `${d.id}: ${key} on a nested level`);
});

test('absorbsNested is declared by the plain mirror alone (spec §3: RAID 51 with 2-disk spans is a four-way RAID 1)', () => {
  eq(leaves.filter((d) => d.absorbsNested).map((d) => d.id).join(','), 'raid1');
});

// The coverage rule: a width that RUNS (≥ minDisksToRun), is not the level
// (< minDisks) and HAS the level's shape is a configuration the game must be
// able to explain. The last clause is the disk-count constraint: 3 disks never
// have RAID 10's shape (even), they are RAID 1E's — so RAID 10 owes no entry there.
for (const d of leaves) {
  const from = Math.max(2, d.minDisksToRun);
  test(`${d.id}: every width that runs below minDisks (${from}…${d.minDisks - 1}) and has its shape has a collapsesTo entry`, () => {
    const declared = new Set((d.collapsesTo || []).map((c) => c.disks));
    for (let n = from; n < d.minDisks; n++) {
      const hasShape = levels.matchShape(M.array(d.shape.segmentation, d.shape.redundancy, disksOf(n)), d.shape);
      if (!hasShape) continue;
      assert(declared.has(n), `${d.id}: ${n} disks runs (minDisksToRun ${d.minDisksToRun}) and no collapsesTo entry explains it`);
    }
  });
}

// Spec §3, hand-derived: what each declared collapse is named by the catalogue.
// The rewritten node is built from `becomes` alone — no normalize() yet — so this
// holds the DATA to the spec, not the engine.
const EXPECTED = { 'raid5@2': 'raid1', 'raid6@3': 'raid1', 'raid10@2': 'raid1' };

test('the declared collapses are exactly the three cases of spec §3', () => {
  const declared = leaves.flatMap((d) => (d.collapsesTo || []).map((c) => `${d.id}@${c.disks}`)).sort();
  eq(declared.join(','), Object.keys(EXPECTED).sort().join(','));
});

for (const d of leaves) for (const c of d.collapsesTo || []) {
  test(`${d.id} @ ${c.disks} disks becomes ${c.becomes.segmentation}+${c.becomes.redundancy}, which the catalogue names ${EXPECTED[`${d.id}@${c.disks}`]}`, () => {
    const rewritten = M.array(c.becomes.segmentation, c.becomes.redundancy, disksOf(c.disks));
    const named = levels.match(rewritten);
    assert(named, `${d.id} @ ${c.disks}: the rewritten shape has no name`);
    eq(named.id, EXPECTED[`${d.id}@${c.disks}`]);
  });
}

finish();
