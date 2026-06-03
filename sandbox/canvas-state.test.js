/**
 * canvas-state.test.js — headless tests for canvas-state.js
 * Run with: node canvas-state.test.js
 */

const RaidModel  = require('./model.js');
const RaidLayout = require('./layout.js');

// Inject globals so canvas-state.js can find them (browser-style)
global.RaidModel  = RaidModel;
global.RaidLayout = RaidLayout;

const CS = require('./canvas-state.js');

let passed = 0, failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function eq(a, b) {
  assert(a === b, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

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

test('valid but no placement (striped + mirror, odd = RAID 1E) → unsupported', () => {
  const s = CS.createState();
  const ids = [0, 1, 2].map(() => CS.addDisk(s, 2));
  const aid = CS.group(s, ids);
  CS.setSegmentation(s, aid, 'striped');
  CS.setRedundancy(s, aid, 'mirror');
  const r = CS.evaluate(s);
  eq(r.firstIssue, null);            // build is valid, just non-standard (RAID 1E)
  assert(r.analysis !== null);        // recognizer still runs (capacity/FT derived)
  assert(r.placement.unsupported);   // odd striped mirror has no verified layout
  assert(r.placement.reason.length > 0);
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

// ---------------------------------------------------------------------------
console.log('\n[12] Regression — no stale member references after remove/dissolve');

// Invariant: every array member id must resolve to a node in `state.nodes`.
// A dangling member makes compile() return null for the whole subtree, which
// silently zeroes the build and leaves it unrepairable from the UI.
function noStaleMembers(s) {
  for (const n of s.nodes.values()) {
    if (n.kind !== 'array') continue;
    for (const mid of n.members) {
      if (!s.nodes.has(mid)) return false;
    }
  }
  return true;
}

// Nested RAID 1+0: a striped parent over two linear-mirror spans.
function buildNestedRaid10(s) {
  const a = CS.group(s, [CS.addDisk(s, 2), CS.addDisk(s, 2)]);
  CS.setSegmentation(s, a, 'linear'); CS.setRedundancy(s, a, 'mirror');
  const b = CS.group(s, [CS.addDisk(s, 2), CS.addDisk(s, 2)]);
  CS.setSegmentation(s, b, 'linear'); CS.setRedundancy(s, b, 'mirror');
  const parent = CS.group(s, [a, b]);
  CS.setSegmentation(s, parent, 'striped'); CS.setRedundancy(s, parent, 'none');
  return { parent, a, b };
}

test('sanity: nested build is recognized as RAID 1+0', () => {
  const s = CS.createState();
  buildNestedRaid10(s);
  eq(CS.evaluate(s).analysis.level, 'RAID 1+0');
});

test('dissolve nested span detaches it from its parent (no stale ref)', () => {
  const s = CS.createState();
  const { parent, a, b } = buildNestedRaid10(s);
  CS.dissolve(s, a);
  assert(!s.nodes.has(a), 'dissolved span still in nodes');
  assert(!s.nodes.get(parent).members.includes(a), 'parent still references dissolved span');
  assert(s.nodes.get(parent).members.includes(b), 'sibling span wrongly dropped');
  assert(noStaleMembers(s), 'parent holds a member that no longer exists');
});

test('remove nested span detaches it from its parent (no stale ref)', () => {
  const s = CS.createState();
  const { parent, a } = buildNestedRaid10(s);
  CS.remove(s, a);
  assert(!s.nodes.has(a));
  assert(!s.nodes.get(parent).members.includes(a), 'parent still references removed span');
  assert(noStaleMembers(s));
});

test('build stays evaluable (not stuck at null) after dissolving a span', () => {
  const s = CS.createState();
  const { a } = buildNestedRaid10(s);
  CS.dissolve(s, a);
  const r = CS.evaluate(s);
  // Parent is now incomplete, but state is consistent and repairable:
  // no dangling refs, and an actionable hint instead of a silent dead end.
  assert(noStaleMembers(s));
  assert(r.firstIssue !== null, 'expected an actionable hint, got none');
});

// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
