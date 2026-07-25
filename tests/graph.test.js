/**
 * graph.test.js — headless tests for the control-path graph module.
 * Run with: node graph.test.js
 *
 * The scenarios are built the way the canvas builds them: component nodes in
 * cpNodes, disks referenced in cpEdges only. A test that fed disks through
 * cpNodes would pass while the real thing fails.
 */

const G = require('../src/engine/graph.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

// --- builders mirroring CanvasState's two maps --------------------------------
const nodes = (...pairs) => new Map(
  pairs.map(([id, componentId]) => [id, { id, componentId }])
);
const edges = (...pairs) => new Map(
  pairs.map(([from, to], i) => [`cpe${i}`, { id: `cpe${i}`, fromNode: from, toNode: to }])
);

// A complete software-RAID path: two SATA disks → backplane → hba → engine → os.
const softwarePath = () => G.build(
  nodes(['b', 'backplane'], ['h', 'hba'], ['e', 'raid-engine'], ['o', 'os-linux']),
  edges(['d1', 'b'], ['d2', 'b'], ['b', 'h'], ['h', 'e'], ['e', 'o'])
);

// ---------------------------------------------------------------------------
console.log('\n[1] build — the graph spans both node maps');

test('component nodes keep their componentId', () => {
  const g = softwarePath();
  eq(g.nodes.get('b').componentId, 'backplane');
});
test('disks appear as nodes even though they are not in cpNodes', () => {
  const g = softwarePath();
  assert(g.nodes.has('d1'), 'disk d1 missing from the graph');
});
test('a disk endpoint carries no componentId', () => {
  const g = softwarePath();
  eq(g.nodes.get('d1').componentId, null);
});
test('an isolated node is in the graph with empty adjacency', () => {
  const g = G.build(nodes(['h', 'hba']), edges());
  eq(g.out.get('h').length, 0);
  eq(g.in.get('h').length, 0);
});
test('forward and reverse adjacency are both indexed', () => {
  const g = softwarePath();
  eq(g.out.get('b').join(','), 'h');
  eq(g.in.get('b').join(','), 'd1,d2');
});
test('empty maps build an empty graph', () => {
  const g = G.build(new Map(), new Map());
  eq(g.nodes.size, 0);
});

// ---------------------------------------------------------------------------
console.log('\n[2] reachableFrom — direction is data flow, disks → OS');

test('a disk reaches the OS through the whole chain', () => {
  assert(G.reaches(softwarePath(), 'd1', 'o'));
});
test('the OS does not reach the disk downstream', () => {
  assert(!G.reaches(softwarePath(), 'o', 'd1'));
});
test('the OS reaches the disk upstream', () => {
  assert(G.reaches(softwarePath(), 'o', 'd1', { direction: 'in' }));
});
test('the start is not in its own reachable set', () => {
  assert(!G.reachableFrom(softwarePath(), 'd1').has('d1'));
});
test('an unknown start yields the empty set, not a throw', () => {
  eq(G.reachableFrom(softwarePath(), 'nope').size, 0);
});
test('intermediate nodes are all collected', () => {
  const seen = G.reachableFrom(softwarePath(), 'd1');
  ['b', 'h', 'e', 'o'].forEach((id) => assert(seen.has(id), `missing ${id}`));
});

// ---------------------------------------------------------------------------
console.log('\n[3] reachableFrom — the holes the recognizer must stop declaring');

test('a floating HBA is not reachable from the disks', () => {
  const g = G.build(
    nodes(['b', 'backplane'], ['h', 'hba'], ['e', 'raid-engine'], ['o', 'os-linux']),
    edges(['d1', 'b'], ['b', 'e'], ['e', 'o'])   // hba on the canvas, wired to nothing
  );
  assert(G.reaches(g, 'd1', 'o'), 'the path itself should still hold');
  assert(!G.reachableFrom(g, 'd1').has('h'), 'the floating HBA must not be on the path');
});
test('a disk wired nowhere reaches nothing', () => {
  const g = G.build(
    nodes(['b', 'backplane'], ['o', 'os-linux']),
    edges(['d1', 'b'], ['b', 'o'])
  );
  eq(G.reachableFrom(g, 'd2').size, 0);
});
test('a gap in the middle breaks reachability to the OS', () => {
  const g = G.build(
    nodes(['b', 'backplane'], ['h', 'hba'], ['e', 'raid-engine'], ['o', 'os-linux']),
    edges(['d1', 'b'], ['b', 'h'], ['e', 'o'])   // hba → engine never drawn
  );
  assert(!G.reaches(g, 'd1', 'o'));
});

// ---------------------------------------------------------------------------
console.log('\n[4] cycles — the engine has `any` ports, so the player can build them');

test('a cycle terminates instead of hanging', () => {
  const g = G.build(
    nodes(['b', 'backplane'], ['h', 'hba'], ['e', 'raid-engine']),
    edges(['b', 'h'], ['h', 'e'], ['e', 'b'])
  );
  eq(G.reachableFrom(g, 'b').size, 3);
});
test('a cycle puts the start back in its own reachable set', () => {
  const g = G.build(nodes(['a', 'hba'], ['b', 'pcie']), edges(['a', 'b'], ['b', 'a']));
  assert(G.reachableFrom(g, 'a').has('a'));
});
test('a self-loop terminates', () => {
  const g = G.build(nodes(['a', 'hba']), edges(['a', 'a']));
  eq(G.reachableFrom(g, 'a').size, 1);
});
test('a cycle off the path does not hide the OS behind it', () => {
  const g = G.build(
    nodes(['b', 'backplane'], ['h', 'hba'], ['e', 'raid-engine'], ['o', 'os-linux']),
    edges(['d1', 'b'], ['b', 'h'], ['h', 'e'], ['e', 'b'], ['e', 'o'])
  );
  assert(G.reaches(g, 'd1', 'o'));
});

// ---------------------------------------------------------------------------
console.log('\n[5] nodesWith — duplicates are the caller\'s problem, not a coin toss');

test('finds the single node of a type', () => {
  eq(G.nodesWith(softwarePath(), 'raid-engine').join(','), 'e');
});
test('returns BOTH nodes when the player dropped two backplanes', () => {
  const g = G.build(nodes(['b1', 'backplane'], ['b2', 'backplane']), edges());
  eq(G.nodesWith(g, 'backplane').length, 2);
});
test('an absent type yields an empty list', () => {
  eq(G.nodesWith(softwarePath(), 'controller-hw').length, 0);
});
test('disks match only the null component type', () => {
  eq(G.nodesWith(softwarePath(), null).length, 2);
});

finish();
