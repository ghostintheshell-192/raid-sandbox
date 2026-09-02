/**
 * raid-levels-data.test.js — validates the REAL raid-levels YAML files and keeps
 * the headless fixture aligned with them.
 * Run with: node raid-levels-data.test.js   (uses python3 + pyyaml to read YAML;
 * this repo is zero-dependency and Node has no YAML parser, so python is the reader.)
 *
 * Three guards:
 *   1. the manifest (index.yaml + every listed file) builds a level catalogue
 *      through the SAME assemble/createLevels the browser uses — a shape with a
 *      typo, a missing reason, a nested level without a childShape all fail
 *      HERE instead of shipping as a level nobody can build;
 *   2. the domain invariants the files must keep (parity levels name a default
 *      algorithm, fault tolerance 0 only without redundancy, …);
 *   3. tests/fixtures/raid-levels.js mirrors the YAML on every field the engine
 *      reads, so the browser (YAML) and Node (fixture) can never name shapes
 *      differently.
 */

const path = require('path');
const { execFileSync } = require('child_process');
const L = require('../src/engine/levels.js');
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

test('every level declares faultTolerance and capacityFormula', () => {
  for (const d of docs) {
    assert(typeof d.faultTolerance === 'number', `${d.id}: faultTolerance`);
    assert(typeof d.capacityFormula === 'string' && d.capacityFormula, `${d.id}: capacityFormula`);
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

test('faultTolerance == 0 only for none-redundancy leaf levels', () => {
  for (const d of docs)
    if (d.faultTolerance === 0)
      assert(d.shape.redundancy === 'none', `${d.id}: faultTolerance 0 but redundancy is "${d.shape.redundancy}"`);
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
});

test('same level ids, same order', () => {
  eq(fixture.levels.map((d) => d.id).join(','), index.map((e) => e.id).join(','));
});

for (const d of docs) {
  test(`${d.id}: name, notRaid, reason, shape and minDisks match the YAML`, () => {
    const mirror = fixture.levels.find((x) => x.id === d.id);
    assert(mirror, `fixture has no "${d.id}"`);
    eq(modelFields(mirror), modelFields(d));
  });
}

finish();
