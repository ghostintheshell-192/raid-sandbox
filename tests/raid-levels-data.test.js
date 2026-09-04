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
 *      checks the `reference` block against the engine.
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
});

test('same level ids, same order', () => {
  eq(fixture.levels.map((d) => d.id).join(','), index.map((e) => e.id).join(','));
});

for (const d of docs) {
  test(`${d.id}: name, notRaid, reason, shape, minDisks and advisory match the YAML`, () => {
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

finish();
