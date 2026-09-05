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
const { createCatalog, assemble } = require('../src/engine/catalog.js');
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
// Assembled by the SAME function the browser loader uses, so a field the loader
// would drop is dropped here too — and the fixture comparison below catches it.
const realManifest = assemble(index, files);

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

test('the assembled manifest carries the roles the recognizer needs', () => {
  const c = createCatalog(realManifest);
  assert(c.roles.sink && typeof c.roles.sink.capability === 'string', 'roles.sink.capability missing');
});

test('assemble refuses a file whose id does not match the index', () => {
  const broken = Object.assign({}, files, { [index.components[0].file]: { id: 'imposter', ports: [] } });
  let err = null;
  try { assemble(index, broken); } catch (e) { err = e; }
  assert(err && /does not match the index entry/.test(err.message), err && err.message);
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

// The fields the engine reads (plus the two ui fields the recognizer names a
// piece by). YAML folded scalars (`>-`) fold to one line, so a verdict reason
// compares as a single string on both sides.
const modelFields = (def) => JSON.stringify({
  id: def.id, provides: def.provides || [], ports: def.ports,
  verdict: def.verdict || null,
  layouts: def.layouts || null,
  writeHole: def.writeHole || null,
  ui: { label: (def.ui || {}).label, badge: (def.ui || {}).badge },
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

test('roles match the YAML', () => {
  eq(JSON.stringify(fixture.roles), JSON.stringify(realManifest.roles));
});

// ---------------------------------------------------------------------------
console.log('\n[4] the verdict data is complete');

test('every non-sink component with a verdict has an output port, and the sink capability exists', () => {
  const sinkCap = realManifest.roles.sink.capability;
  let sinks = 0;
  for (const def of realManifest.components) {
    const isSink = (def.provides || []).includes(sinkCap);
    if (isSink) { sinks++; assert(def.verdict, `${def.id}: a sink must declare its verdict`); }
    if (def.verdict && !isSink)
      assert(def.ports.some((p) => p.dir === 'out'), `${def.id}: an engine object needs an output port`);
    if (def.verdict) {
      assert(typeof def.verdict.raidType === 'string', `${def.id}: verdict.raidType`);
      assert(typeof def.verdict.reason === 'string' && def.verdict.reason.length > 20, `${def.id}: verdict.reason`);
    }
  }
  assert(sinks >= 1, 'no component provides the sink capability');
});

// ---------------------------------------------------------------------------
console.log('\n[5] the layout capabilities are complete');

// `layout:<algorithm>` in `provides:` is what makes the cross-axis rule (§6/§9.7)
// data-driven: a claimed layout is legal only where its claimant is the engine,
// and the claimant's `layouts.reason` is the sentence the player reads. A claim
// without a reason would fire nothing, which looks exactly like no rule at all.
const LAYOUT_CAP = 'layout:';
const layoutCaps = (def) => (def.provides || []).filter((c) => c.startsWith(LAYOUT_CAP));

test('every component claiming a layout also explains it (layouts.reason)', () => {
  let claimants = 0;
  for (const def of realManifest.components) {
    if (!layoutCaps(def).length) continue;
    claimants++;
    assert(def.layouts && typeof def.layouts.reason === 'string' && def.layouts.reason.length > 20,
      `${def.id}: claims ${layoutCaps(def).join(', ')} but declares no layouts.reason`);
    for (const ph of ['{label}', '{algorithm}', '{raidType}'])
      assert(def.layouts.reason.includes(ph), `${def.id}: layouts.reason has no ${ph}`);
  }
  assert(claimants >= 1, 'no component claims any layout — the cross-axis rule can never fire');
});

test('a layouts.reason without a layout claim would be dead text', () => {
  for (const def of realManifest.components)
    if (def.layouts) assert(layoutCaps(def).length,
      `${def.id}: declares layouts.reason but claims no layout:<algorithm>`);
});

// The layouts a level names as its own must be claimed by somebody, or the game
// offers a layout in the UI that no path can legally build.
test('the mdadm RAID 10 layouts are claimed by exactly one component', () => {
  const claimed = createCatalog(realManifest);
  for (const algo of ['near', 'far', 'offset']) {
    const who = claimed.providersOf(LAYOUT_CAP + algo);
    assert(who.length === 1, `${algo} is claimed by ${who.length} components: ${who.join(', ')}`);
  }
});

// ---------------------------------------------------------------------------
console.log('\n[6] every RAID engine either survives a power cut or explains why not');

// The §6 `write-hole` rule is a comparison and holds no sentence: an engine that
// keeps a parity write safe across a power cut claims `power-loss-protection`,
// and one that cannot carries the sentence a player should read in its own
// `writeHole.reason`. So the invariant that is actually checkable in the data is
// the exclusive-or: for every component that can BE the engine on a path (it
// provides `raid-engine`), exactly one of the two is present. An engine with
// neither is a silent gap — the rule fires nothing and the player is told
// nothing; an engine with both contradicts itself.
const POWER_LOSS_CAP = 'power-loss-protection';
const isEngine   = (def) => (def.provides || []).includes('raid-engine');
const isProtected = (def) => (def.provides || []).includes(POWER_LOSS_CAP);

test('every raid-engine component either claims power-loss-protection or declares writeHole.reason', () => {
  let engines = 0;
  for (const def of realManifest.components) {
    if (!isEngine(def)) continue;
    engines++;
    if (isProtected(def)) {
      assert(!def.writeHole,
        `${def.id}: claims ${POWER_LOSS_CAP} and still declares writeHole.reason — pick one`);
    } else {
      assert(def.writeHole && typeof def.writeHole.reason === 'string' && def.writeHole.reason.length > 20,
        `${def.id}: is a RAID engine, does not claim ${POWER_LOSS_CAP}, and explains nothing`);
    }
  }
  assert(engines >= 2, 'fewer than two RAID engines — the write-hole rule cannot be exercised');
});

test('at least one engine protects and at least one does not', () => {
  const engines = realManifest.components.filter(isEngine);
  assert(engines.some(isProtected), `no component claims ${POWER_LOSS_CAP} — the rule could never stay silent`);
  assert(engines.some((d) => !isProtected(d)), 'every engine is protected — the rule could never fire');
});

test('a writeHole.reason on a component that is not an engine would be dead text', () => {
  for (const def of realManifest.components)
    if (def.writeHole) assert(isEngine(def),
      `${def.id}: declares writeHole.reason but is never the engine on a path`);
});

finish();
