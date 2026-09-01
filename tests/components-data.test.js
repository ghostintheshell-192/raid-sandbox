/**
 * components-data.test.js — validates the REAL component YAML files and keeps the
 * headless fixture aligned with them.
 * Run with: node components-data.test.js   (uses python3 + pyyaml to read YAML;
 * this repo is zero-dependency and Node has no YAML parser, so python is the reader.)
 *
 * Three guards:
 *   1. the manifest (index.yaml + every listed file) builds a catalogue — a port
 *      type nobody declared, a duplicate id, a port without a direction all fail
 *      HERE instead of shipping as a piece the player cannot wire;
 *   2. every disk protocol the palette offers has somewhere to route to;
 *   3. tests/fixtures/components.js mirrors the YAML on every model field, so
 *      the browser (YAML) and Node (fixture) can never read different ports
 *      (tech-debt/ports-double-source-of-truth.md).
 */

const path = require('path');
const { execFileSync } = require('child_process');
const { createCatalog } = require('../src/engine/catalog.js');
const fixture = require('./fixtures/components.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

const dir = path.join(__dirname, '..', 'data', 'components');
const PY = `
import yaml, json, os, sys
base = sys.argv[1]
with open(os.path.join(base, 'index.yaml')) as fh: index = yaml.safe_load(fh)
files = {}
for entry in index.get('components', []):
    with open(os.path.join(base, entry['file'])) as fh: files[entry['file']] = yaml.safe_load(fh)
print(json.dumps({ 'index': index, 'files': files }))
`;
let data;
try {
  data = JSON.parse(execFileSync('python3', ['-c', PY, dir], { encoding: 'utf8' }));
} catch (e) {
  console.error('Could not read component YAML via python3/pyyaml:', e.message);
  process.exit(1);
}
const { index, files } = data;
const realManifest = {
  components: index.components.map((e) => files[e.file]),
  portTypes:  index.portTypes,
};

// ---------------------------------------------------------------------------
console.log('\n[1] index.yaml and the component files agree');

test('index.yaml has a components list and a portTypes map', () => {
  assert(Array.isArray(index.components), 'components must be a list');
  assert(index.portTypes && typeof index.portTypes === 'object', 'portTypes must be a map');
});

for (const entry of index.components) {
  test(`${entry.file}: id "${entry.id}" matches the file`, () => {
    eq(files[entry.file].id, entry.id);
  });
  test(`${entry.file}: ports are top-level (model), not under ui:`, () => {
    assert(Array.isArray(files[entry.file].ports), 'missing top-level ports');
    assert(!(files[entry.file].ui && files[entry.file].ui.ports), 'ui.ports is a leftover');
  });
}

test('the real manifest builds a catalogue', () => {
  const c = createCatalog(realManifest);
  eq(c.ids().length, index.components.length);
});

// ---------------------------------------------------------------------------
console.log('\n[2] every disk protocol has somewhere to route');

// The three protocols the palette (index.html) offers. A disk of a protocol no
// component accepts would route nowhere forever, and the verdict would blame
// the player for a gap that is in the data.
for (const protocol of ['SATA', 'SAS', 'NVMe']) {
  test(`${protocol} disks are accepted by at least one input port`, () => {
    const acc = createCatalog(realManifest).acceptorsOf(protocol);
    assert(acc.length >= 1, `no component accepts ${protocol}`);
  });
}

// ---------------------------------------------------------------------------
console.log('\n[3] the headless fixture mirrors the YAML');

const modelFields = (def) => JSON.stringify({
  id: def.id, provides: def.provides || [], ports: def.ports,
});

test('same component ids, same order', () => {
  eq(fixture.components.map((c) => c.id).join(','),
     realManifest.components.map((c) => c.id).join(','));
});

for (const real of realManifest.components) {
  test(`${real.id}: provides and ports match the YAML`, () => {
    const mirror = fixture.components.find((c) => c.id === real.id);
    assert(mirror, `fixture has no "${real.id}"`);
    eq(modelFields(mirror), modelFields(real));
  });
}

test('portTypes match the YAML', () => {
  eq(JSON.stringify(fixture.portTypes), JSON.stringify(realManifest.portTypes));
});

finish();
