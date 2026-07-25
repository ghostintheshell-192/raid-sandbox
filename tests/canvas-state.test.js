/**
 * canvas-state.test.js — headless tests for canvas-state.js
 * Run with: node canvas-state.test.js
 */

const RaidModel  = require('../src/engine/model.js');
const RaidLayout = require('../src/engine/layout.js');

// Inject globals so canvas-state.js can find them (browser-style)
global.RaidModel  = RaidModel;
global.RaidLayout = RaidLayout;

const CS = require('../src/sandbox/canvas-state.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

// ---------------------------------------------------------------------------
console.log('\n[1] State factory');

test('createState returns empty state', () => {
  const s = CS.createState();
  eq(s.nodes.size, 0);
  eq(s.roots.size, 0);
  eq(s.positions.size, 0);
  eq(s.selected.size, 0);
});

// ---------------------------------------------------------------------------
console.log('\n[2] Mutations — addDisk');

test('addDisk adds disk to nodes and roots', () => {
  const s = CS.createState();
  const id = CS.addDisk(s, 2, 'SATA', { x: 10, y: 20 });
  assert(id.startsWith('disk-'), `id prefix: ${id}`);
  assert(s.nodes.has(id));
  assert(s.roots.has(id));
  assert(s.positions.has(id));
  eq(s.nodes.get(id).sizeGB, 2);
  eq(s.positions.get(id).x, 10);
});

test('addDisk defaults protocol to SATA', () => {
  const s = CS.createState();
  const id = CS.addDisk(s, 4);
  eq(s.nodes.get(id).protocol, 'SATA');
});

// ---------------------------------------------------------------------------
console.log('\n[3] Mutations — group');

test('group creates incomplete array, removes members from roots', () => {
  const s = CS.createState();
  const d1 = CS.addDisk(s, 2);
  const d2 = CS.addDisk(s, 2);
  const aid = CS.group(s, [d1, d2]);
  assert(aid.startsWith('array-'));
  assert(s.roots.has(aid));
  assert(!s.roots.has(d1));
  assert(!s.roots.has(d2));
  const arr = s.nodes.get(aid);
  eq(arr.segmentation, null);
  eq(arr.redundancy, null);
  eq(arr.members.length, 2);
});

// ---------------------------------------------------------------------------
console.log('\n[4] Mutations — addToArray');

test('addToArray moves disk from roots into array', () => {
  const s = CS.createState();
  const d1 = CS.addDisk(s, 2);
  const d2 = CS.addDisk(s, 2);
  const d3 = CS.addDisk(s, 2);
  const aid = CS.group(s, [d1, d2]);
  CS.addToArray(s, aid, d3);
  assert(!s.roots.has(d3));
  eq(s.nodes.get(aid).members.length, 3);
});

test('addToArray moves disk from one array to another — no duplicate membership', () => {
  const s = CS.createState();
  const d1 = CS.addDisk(s, 2);
  const d2 = CS.addDisk(s, 2);
  const d3 = CS.addDisk(s, 2);
  const d4 = CS.addDisk(s, 2);
  const a1 = CS.group(s, [d1, d2]);
  const a2 = CS.group(s, [d3, d4]);
  // Move d1 from a1 to a2
  CS.addToArray(s, a2, d1);
  assert(!s.nodes.get(a1).members.includes(d1), 'd1 still in a1 after move');
  assert(s.nodes.get(a2).members.includes(d1), 'd1 not in a2 after move');
  eq(s.nodes.get(a1).members.length, 1);
  eq(s.nodes.get(a2).members.length, 3);
});

// ---------------------------------------------------------------------------
console.log('\n[5] Mutations — setSegmentation / setRedundancy');

test('setSegmentation updates array node', () => {
  const s = CS.createState();
  const d1 = CS.addDisk(s, 2); const d2 = CS.addDisk(s, 2);
  const aid = CS.group(s, [d1, d2]);
  CS.setSegmentation(s, aid, 'striped');
  eq(s.nodes.get(aid).segmentation, 'striped');
});

test('setRedundancy updates array node', () => {
  const s = CS.createState();
  const d1 = CS.addDisk(s, 2); const d2 = CS.addDisk(s, 2);
  const aid = CS.group(s, [d1, d2]);
  CS.setRedundancy(s, aid, 'none');
  eq(s.nodes.get(aid).redundancy, 'none');
});

// ---------------------------------------------------------------------------
console.log('\n[6] Mutations — dissolve');

test('dissolve returns members to roots and removes array', () => {
  const s = CS.createState();
  const d1 = CS.addDisk(s, 2); const d2 = CS.addDisk(s, 2);
  const aid = CS.group(s, [d1, d2]);
  CS.dissolve(s, aid);
  assert(!s.nodes.has(aid));
  assert(s.roots.has(d1));
  assert(s.roots.has(d2));
});

// ---------------------------------------------------------------------------
console.log('\n[7] Mutations — remove');

test('remove disk deletes node, position, root entry', () => {
  const s = CS.createState();
  const id = CS.addDisk(s, 2);
  CS.remove(s, id);
  assert(!s.nodes.has(id));
  assert(!s.positions.has(id));
  assert(!s.roots.has(id));
});

test('remove array dissolves members first', () => {
  const s = CS.createState();
  const d1 = CS.addDisk(s, 2); const d2 = CS.addDisk(s, 2);
  const aid = CS.group(s, [d1, d2]);
  CS.remove(s, aid);
  assert(!s.nodes.has(aid));
  assert(s.roots.has(d1));
  assert(s.roots.has(d2));
});

// ---------------------------------------------------------------------------
console.log('\n[8] Mutations — move (fast path)');

test('move updates position without touching nodes', () => {
  const s = CS.createState();
  const id = CS.addDisk(s, 2, 'SATA', { x: 0, y: 0 });
  CS.move(s, id, { x: 99, y: 88 });
  eq(s.positions.get(id).x, 99);
  eq(s.nodes.get(id).sizeGB, 2); // node unchanged
});

// ---------------------------------------------------------------------------
console.log('\n[9] evaluate() — incomplete and disconnected states');

test('empty canvas → firstIssue, no analysis', () => {
  const s = CS.createState();
  const r = CS.evaluate(s);
  assert(r.firstIssue !== null);
  assert(r.analysis === null);
  eq(r.rootCount, 0);
});

test('two loose disks → firstIssue about creating array', () => {
  const s = CS.createState();
  CS.addDisk(s, 2); CS.addDisk(s, 2);
  const r = CS.evaluate(s);
  assert(r.firstIssue !== null);
  assert(r.analysis === null);
});

test('array missing segmentation → firstIssue about segmentation', () => {
  const s = CS.createState();
  const d1 = CS.addDisk(s, 2); const d2 = CS.addDisk(s, 2);
  CS.group(s, [d1, d2]);
  const r = CS.evaluate(s);
  assert(r.firstIssue !== null && r.firstIssue.toLowerCase().includes('segmentation'), r.firstIssue);
  assert(r.analysis === null);
});

test('array missing redundancy → firstIssue about redundancy', () => {
  const s = CS.createState();
  const d1 = CS.addDisk(s, 2); const d2 = CS.addDisk(s, 2);
  const aid = CS.group(s, [d1, d2]);
  CS.setSegmentation(s, aid, 'striped');
  const r = CS.evaluate(s);
  assert(r.firstIssue !== null && r.firstIssue.toLowerCase().includes('redundancy'), r.firstIssue);
  assert(r.analysis === null);
});

test('disconnected array + loose disk → firstIssue about connecting', () => {
  const s = CS.createState();
  const d1 = CS.addDisk(s, 2); const d2 = CS.addDisk(s, 2);
  const d3 = CS.addDisk(s, 2);
  const aid = CS.group(s, [d1, d2]);
  CS.setSegmentation(s, aid, 'striped');
  CS.setRedundancy(s, aid, 'none');
  // d3 is a loose root
  const r = CS.evaluate(s);
  eq(r.rootCount, 2);
  assert(r.firstIssue !== null);
  assert(r.analysis === null);
});

// ---------------------------------------------------------------------------
console.log('\n[10] evaluate() — valid builds');

test('RAID 0 (striped + none, 4 disks) → analysis + placement', () => {
  const s = CS.createState();
  const ids = [0,1,2,3].map(() => CS.addDisk(s, 2));
  const aid = CS.group(s, ids);
  CS.setSegmentation(s, aid, 'striped');
  CS.setRedundancy(s, aid, 'none');
  const r = CS.evaluate(s);
  eq(r.firstIssue, null);
  eq(r.analysis.level, 'RAID 0');
  assert(r.placement && !r.placement.unsupported, 'expected placement grid');
  eq(r.analysis.capacityGB, 8);
  eq(r.analysis.faultTolerance, 0);
});

test('RAID 1 (linear + mirror, 2 disks) → analysis + placement', () => {
  const s = CS.createState();
  const d1 = CS.addDisk(s, 4); const d2 = CS.addDisk(s, 4);
  const aid = CS.group(s, [d1, d2]);
  CS.setSegmentation(s, aid, 'linear');
  CS.setRedundancy(s, aid, 'mirror');
  const r = CS.evaluate(s);
  eq(r.firstIssue, null);
  eq(r.analysis.level, 'RAID 1');
  assert(r.placement && !r.placement.unsupported);
  eq(r.analysis.capacityGB, 4);
  eq(r.analysis.faultTolerance, 1);
});

test('RAID 5 (striped + parity1, 3 disks) → analysis + placement', () => {
  const s = CS.createState();
  const ids = [0,1,2].map(() => CS.addDisk(s, 3));
  const aid = CS.group(s, ids);
  CS.setSegmentation(s, aid, 'striped');
  CS.setRedundancy(s, aid, 'parity1');
  const r = CS.evaluate(s);
  eq(r.firstIssue, null);
  eq(r.analysis.level, 'RAID 5');
  assert(r.placement && !r.placement.unsupported);
  eq(r.analysis.capacityGB, 6);
  eq(r.analysis.faultTolerance, 1);
});

test('RAID 6 (striped + parity2, 4 disks) → analysis + placement', () => {
  const s = CS.createState();
  const ids = [0,1,2,3].map(() => CS.addDisk(s, 2));
  const aid = CS.group(s, ids);
  CS.setSegmentation(s, aid, 'striped');
  CS.setRedundancy(s, aid, 'parity2');
  const r = CS.evaluate(s);
  eq(r.firstIssue, null);
  eq(r.analysis.level, 'RAID 6');
  assert(r.placement && !r.placement.unsupported);
  eq(r.analysis.capacityGB, 4);
  eq(r.analysis.faultTolerance, 2);
});

test('flat RAID 10 (striped + mirror, even) → RAID 10, placement near', () => {
  const s = CS.createState();
  const ids = [0, 1, 2, 3].map(() => CS.addDisk(s, 2));
  const aid = CS.group(s, ids);
  CS.setSegmentation(s, aid, 'striped');
  CS.setRedundancy(s, aid, 'mirror');
  const r = CS.evaluate(s);
  eq(r.analysis.level, 'RAID 10');
  assert(!r.placement.unsupported);     // flat RAID 10 has a defined layout
  eq(r.placement.algorithm, 'near');    // default mirror-class layout
});

test('striped + mirror, odd disks → RAID 1E, interleaved near placement', () => {
  const s = CS.createState();
  const ids = [0, 1, 2].map(() => CS.addDisk(s, 2));
  const aid = CS.group(s, ids);
  CS.setSegmentation(s, aid, 'striped');
  CS.setRedundancy(s, aid, 'mirror');
  const r = CS.evaluate(s);
  eq(r.firstIssue, null);              // valid build
  eq(r.analysis.level, 'RAID 1E');     // odd striped mirror is now named
  assert(!r.placement.unsupported);    // and has a defined (near, slot-stream) layout
  eq(r.placement.algorithm, 'near');
});

// ---------------------------------------------------------------------------
console.log('\n[11] compile() edge cases');

test('compile returns null for incomplete array', () => {
  const s = CS.createState();
  const d1 = CS.addDisk(s, 2); const d2 = CS.addDisk(s, 2);
  const aid = CS.group(s, [d1, d2]);
  CS.setSegmentation(s, aid, 'striped');
  // redundancy still null
  eq(CS.compile(s, aid), null);
});

test('compile returns null for unknown id', () => {
  const s = CS.createState();
  eq(CS.compile(s, 'nonexistent'), null);
});

test('compile carries the canvas id onto every array node, nested spans included', () => {
  const s = CS.createState();
  const span = (n) => {
    const ds  = Array.from({ length: n }, () => CS.addDisk(s, 2));
    const aid = CS.group(s, ds);
    CS.setSegmentation(s, aid, 'striped');
    CS.setRedundancy(s, aid, 'parity1');
    return aid;
  };
  const s1 = span(3), s2 = span(3);
  const top = CS.group(s, [s1, s2]);
  CS.setSegmentation(s, top, 'striped');
  CS.setRedundancy(s, top, 'none');

  const tree = CS.compile(s, top);           // RAID 50
  eq(tree.id, top);
  eq(tree.members[0].id, s1);
  eq(tree.members[1].id, s2);
  // Distinct ids are what lets the validator report per-span violations
  // instead of collapsing them — see the (code, nodeId) dedup.
  assert(tree.members[0].id !== tree.members[1].id);
});

// ---------------------------------------------------------------------------
console.log('\n[12] evaluate() reconciles a corrupted root/member history');

function raid6of6() {
  const s  = CS.createState();
  const ds = Array.from({ length: 6 }, () => CS.addDisk(s, 4));
  const a  = CS.group(s, ds);
  CS.setSegmentation(s, a, 'striped');
  CS.setRedundancy(s, a, 'parity2');
  return { s, a };
}

test('a phantom root id (leftover from a deleted node) does not block recognition', () => {
  const { s } = raid6of6();
  eq(CS.evaluate(s).analysis.level, 'RAID 6');   // sanity
  s.roots.add('disk-deleted-999');               // corrupt: stale id lingering in roots
  const r = CS.evaluate(s);
  eq(r.rootCount, 1);
  eq(r.analysis.level, 'RAID 6');
});

test('a dangling member reference is pruned so the array still compiles', () => {
  const s  = CS.createState();
  const d1 = CS.addDisk(s, 2), d2 = CS.addDisk(s, 2);
  const a  = CS.group(s, [d1, d2]);
  CS.setSegmentation(s, a, 'striped'); CS.setRedundancy(s, a, 'none');
  s.nodes.get(a).members.push('disk-ghost');     // corrupt: member that no longer exists
  eq(CS.evaluate(s).analysis.level, 'RAID 0');
});

test('a node that is both a root and a member counts only as a member', () => {
  const s  = CS.createState();
  const d1 = CS.addDisk(s, 2), d2 = CS.addDisk(s, 2);
  const a  = CS.group(s, [d1, d2]);
  CS.setSegmentation(s, a, 'striped'); CS.setRedundancy(s, a, 'none');
  s.roots.add(d1);                               // corrupt: member re-added to roots
  const r = CS.evaluate(s);
  eq(r.rootCount, 1);
  eq(r.analysis.level, 'RAID 0');
});

// ---------------------------------------------------------------------------
console.log('\n[13] reset() — master clear');

test('reset wipes both axes and leaves an empty, evaluable state', () => {
  const s = CS.createState();
  const a = CS.group(s, [CS.addDisk(s, 4), CS.addDisk(s, 4)]);
  CS.setSegmentation(s, a, 'striped'); CS.setRedundancy(s, a, 'parity1');
  CS.cpAddNode(s, 'hba');
  CS.evaluate(s);
  CS.reset(s);
  eq(s.nodes.size, 0); eq(s.roots.size, 0); eq(s.positions.size, 0);
  eq(s.cpNodes.size, 0); eq(s.cpEdges.size, 0); eq(s.cpDiskPositions.size, 0);
  const r = CS.evaluate(s);
  eq(r.rootCount, 0);
  eq(r.analysis, null);
});

// ---------------------------------------------------------------------------
finish();
