/**
 * build-document.test.js — headless tests for the build document (save / load / share).
 * Run with: node build-document.test.js
 */

const CS = require('../src/sandbox/canvas-state.js');
const BD = require('../src/sandbox/build-document.js');
const { createCatalog } = require('../src/engine/catalog.js');
const { createLevels }  = require('../src/engine/levels.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

const catalog = createCatalog(require('./fixtures/components.js'));
const levels  = createLevels(require('./fixtures/raid-levels.js'));
const fresh   = () => CS.createState({ catalog, levels });

/** A RAID 50 on the data side, wired hardware on the physical side, with positions. */
function sampleBuild() {
  const s = fresh();
  const span = () => {
    const a = CS.group(s, [CS.addDisk(s, 2, 'SATA', { x: 10, y: 20 }), CS.addDisk(s, 2), CS.addDisk(s, 2)]);
    CS.setSegmentation(s, a, 'striped');
    CS.setRedundancy(s, a, 'parity1');
    CS.setAlgorithm(s, a, 'right-asymmetric');
    return a;
  };
  const top = CS.group(s, [span(), span()]);
  CS.setSegmentation(s, top, 'striped');
  CS.setRedundancy(s, top, 'none');
  const bp  = CS.cpAddNode(s, 'backplane', { x: 1, y: 2 });
  const roc = CS.cpAddNode(s, 'engine-roc', { x: 3, y: 4 });
  const cpu = CS.cpAddNode(s, 'cpu');
  const os  = CS.cpAddNode(s, 'os-linux');
  CS.cpConnect(s, bp, 'out', roc, 'in');
  CS.cpConnect(s, roc, 'out', cpu, 'in');
  CS.cpConnect(s, cpu, 'out', os, 'in');
  CS.cpSetDiskPos(s, Array.from(s.nodes.keys())[0], { x: 99, y: 98 });
  return s;
}

const summary = (r) => JSON.stringify({
  level: r.analysis && r.analysis.level, cap: r.analysis && r.analysis.capacityGB,
  raidType: r.raidType, reason: r.controlPathReason, issue: r.controlPathIssue,
  hard: r.violations.hard.map((v) => v.code), placement: r.placement && r.placement.algorithm,
});

// ---------------------------------------------------------------------------
console.log('\n[1] a build survives the round trip');

test('toDocument → loadDocument reproduces the evaluation exactly', () => {
  const a = sampleBuild();
  const before = summary(CS.evaluate(a));
  const doc = BD.toDocument(a);
  const b = fresh();
  BD.loadDocument(b, doc);
  eq(summary(CS.evaluate(b)), before);
  eq(CS.evaluate(b).raidType, 'hardware');
});

test('ids, physical positions and the algorithm are kept verbatim', () => {
  const a = sampleBuild();
  const doc = BD.toDocument(a);
  const b = fresh();
  BD.loadDocument(b, doc);
  eq(Array.from(b.nodes.keys()).sort().join(','), Array.from(a.nodes.keys()).sort().join(','));
  eq(Array.from(b.cpNodes.keys()).join(','), Array.from(a.cpNodes.keys()).join(','));
  const firstDisk = Array.from(a.nodes.keys())[0];
  eq(b.cpDiskPositions.get(firstDisk).x, 99);
  eq(b.cpNodes.get(Array.from(a.cpNodes.keys())[0]).pos.x, 1);
  assert(!('pos' in doc.disks[0]), 'the data view lays the tree out in flow: no disk positions to keep');
  const anArray = Array.from(a.nodes.values()).find((n) => n.kind === 'array' && n.redundancy === 'parity1');
  eq(b.nodes.get(anArray.id).algorithm, 'right-asymmetric');
});

test('derived disk edges are not written, and are re-derived on load', () => {
  const a = sampleBuild();
  const doc = BD.toDocument(a);
  eq(doc.wires.length, 3);                                   // the three hand-drawn wires only
  assert(doc.wires.every((w) => w.from.startsWith('cpn-')), 'no disk appears as a wire source');
  const b = fresh();
  BD.loadDocument(b, doc);
  const derived = Array.from(b.cpEdges.values()).filter((e) => e.derived);
  eq(derived.length, 6);                                     // six SATA disks → the backplane
});

test('the id counter continues past the loaded ids', () => {
  const a = sampleBuild();
  const b = fresh();
  BD.loadDocument(b, BD.toDocument(a));
  const d = CS.addDisk(b, 4);
  assert(!a.nodes.has(d) && !a.cpNodes.has(d), `fresh id "${d}" collides with a loaded one`);
});

test('an empty state is an empty document, and loads back empty', () => {
  const doc = BD.toDocument(fresh());
  eq(JSON.stringify(doc), JSON.stringify({ v: 1, disks: [], arrays: [], components: [], wires: [] }));
  const b = fresh();
  BD.loadDocument(b, doc);
  eq(b.nodes.size + b.cpNodes.size + b.cpEdges.size, 0);
});

test('loading replaces the previous build in place (the state object is shared)', () => {
  const b = sampleBuild();
  const ref = b;
  BD.loadDocument(b, BD.toDocument(fresh()));
  assert(ref === b, 'same object');
  eq(b.nodes.size, 0);
  eq(b.catalog, catalog);                                    // data is not build: it stays
});

// ---------------------------------------------------------------------------
console.log('\n[2] a document that cannot be honoured is refused, naming the piece');

const refuses = (mutate, re) => {
  const doc = BD.toDocument(sampleBuild());
  mutate(doc);
  const b = fresh();
  CS.addDisk(b, 1);                                          // something to prove untouched
  let err = null;
  try { BD.loadDocument(b, doc); } catch (e) { err = e; }
  assert(err, 'expected loadDocument to throw');
  assert(re.test(err.message), err.message);
  return b;
};

test('an unknown version', () => {
  const b = refuses((d) => { d.v = 7; }, /unknown version 7/);
  eq(b.nodes.size, 1);                                       // validation failed before reset
});
test('a member naming no node', () => refuses((d) => { d.arrays[0].members.push('ghost'); }, /member "ghost" names no disk or array/));
test('a node claimed by two arrays', () => refuses((d) => { d.arrays[1].members.push(d.arrays[0].members[0]); }, /is a member of two arrays/));
test('an unknown redundancy', () => refuses((d) => { d.arrays[0].redundancy = 'triple'; }, /unknown redundancy "triple"/));
test('a wire to a component that is not there', () => refuses((d) => { d.wires[0].to = 'cpn-999'; }, /names no component/));

test('a wire the catalogue forbids fails loudly, and leaves the state empty, not half-loaded', () => {
  const doc = BD.toDocument(sampleBuild());
  const bp  = doc.components.find((c) => c.componentId === 'backplane').id;
  const cpu = doc.components.find((c) => c.componentId === 'cpu').id;
  doc.wires.push({ id: 'cpe-77', from: bp, fromPort: 'out', to: cpu, toPort: 'in' });   // routing → pcie
  const b = fresh();
  let err = null;
  try { BD.loadDocument(b, doc); } catch (e) { err = e; }
  assert(err && /cpe-77: .*"routing" output cannot feed a "pcie" input/.test(err.message), err && err.message);
  eq(b.nodes.size + b.cpNodes.size + b.cpEdges.size, 0);
});

// ---------------------------------------------------------------------------
console.log('\n[3] encoding: a URL-safe string, and back');

test('encode → decode is the identity on the document', () => {
  const doc = BD.toDocument(sampleBuild());
  const str = BD.encode(doc);
  assert(/^[A-Za-z0-9_-]+$/.test(str), `not URL-safe: ${str.slice(0, 40)}…`);
  eq(JSON.stringify(BD.decode(str)), JSON.stringify(doc));
});

test('garbage is refused with a reason', () => {
  let err = null;
  try { BD.decode('%%%not base64%%%'); } catch (e) { err = e; }
  assert(err && /unknown form "%"/.test(err.message), err && err.message);
  err = null;
  try { BD.decode('c%%%not base64%%%'); } catch (e) { err = e; }
  assert(err && /not (base64|JSON)|malformed/.test(err.message), err && err.message);
  err = null;
  try { BD.decode(BD.encode({ hello: 'world' })); } catch (e) { err = e; }
  assert(err && /unknown version/.test(err.message), err && err.message);
});

test('a shareable build is a SHORT fragment: the compact form, not the JSON', () => {
  const str = BD.encode(BD.toDocument(sampleBuild()));
  eq(str[0], 'c');
  assert(str.length < 600, `${str.length} chars for a 6-disk RAID 50 with a wired path`);
});

test('positions are rounded to whole pixels on the wire', () => {
  const a = fresh();
  const id = CS.cpAddNode(a, 'backplane', { x: 12.4, y: 99.6 });
  const back = BD.decode(BD.encode(BD.toDocument(a)));
  eq(back.components[0].id, id);
  eq(back.components[0].pos.x, 12);
  eq(back.components[0].pos.y, 100);
});

test('a document with hand-written ids falls back to the plain form, and still round-trips', () => {
  const doc = { v: 1,
    disks: [{ id: 'left', sizeGB: 2, protocol: 'SATA' }, { id: 'right', sizeGB: 2, protocol: 'SATA' }],
    arrays: [{ id: 'pair', segmentation: 'linear', redundancy: 'mirror', algorithm: null, members: ['left', 'right'] }],
    components: [], wires: [] };
  const str = BD.encode(doc);
  eq(str[0], 'j');
  eq(JSON.stringify(BD.decode(str)), JSON.stringify(doc));
  const b = fresh();
  BD.loadDocument(b, doc);
  eq(CS.evaluate(b).analysis.level, 'RAID 1');
  assert(/^disk-\d+$/.test(CS.addDisk(b, 1)), 'fresh ids keep their own form');
});

finish();
