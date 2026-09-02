/**
 * canvas-state.fuzz.test.js — deterministic gesture-workflow fuzz test.
 * Run with: node canvas-state.fuzz.test.js
 *
 * Simulates long, arbitrary user sessions (add / group / nest / set / dissolve /
 * remove / re-add, in random order) and asserts the state stays well-formed and
 * the recognizer keeps working — the "does it survive any workflow?" question.
 *
 * After EVERY gesture (which runs evaluate() → _reconcile) these invariants hold:
 *   I1  every root id exists in nodes
 *   I2  no root is a member of any array
 *   I3  every member id exists in nodes (no dangling references)
 *   I4  no node is a member of more than one array (single membership)
 *   I5  rootCount === the true number of forest roots
 *   I6  evaluate() never throws and always terminates (no cycle → no infinite walk)
 *   I7  a single, complete, acyclic tree always yields a non-null analysis
 */

const RaidModel  = require('../src/engine/model.js');
const RaidLayout = require('../src/engine/layout.js');
global.RaidModel  = RaidModel;
global.RaidLayout = RaidLayout;
global.RaidValidator = require('../src/engine/validator.js');
const CS = require('../src/sandbox/canvas-state.js');
const { test, assert, finish } = require('./test-helpers.js');
const levels = require('../src/engine/levels.js')
  .createLevels(require('./fixtures/raid-levels.js'));   // the level catalogue: data, mirrored from YAML

// Deterministic PRNG (mulberry32) so failures are reproducible.
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

const SEGS = ['striped', 'linear'];
const REDS = ['none', 'mirror', 'parity1', 'parity2'];
const SIZES = [1, 2, 4];

function checkInvariants(state, evalResult, where) {
  const claimed = new Map();   // memberId → owning arrayId
  for (const n of state.nodes.values()) {
    if (n.kind !== 'array') continue;
    for (const mid of n.members) {
      assert(state.nodes.has(mid), `${where}: I3 dangling member ${mid} in ${n.id}`);
      assert(!claimed.has(mid), `${where}: I4 ${mid} member of both ${claimed.get(mid)} and ${n.id}`);
      claimed.set(mid, n.id);
    }
  }
  for (const id of state.roots) {
    assert(state.nodes.has(id), `${where}: I1 phantom root ${id}`);
    assert(!claimed.has(id),    `${where}: I2 root ${id} is also a member`);
  }
  const trueRoots = Array.from(state.nodes.keys()).filter((id) => !claimed.has(id));
  assert(evalResult.rootCount === trueRoots.length,
    `${where}: I5 rootCount ${evalResult.rootCount} ≠ true roots ${trueRoots.length}`);
}

function looseIds(state) {
  const members = new Set();
  for (const n of state.nodes.values())
    if (n.kind === 'array') n.members.forEach((m) => members.add(m));
  return Array.from(state.nodes.keys()).filter((id) => !members.has(id));
}
const arrayIds = (state) =>
  Array.from(state.nodes.values()).filter((n) => n.kind === 'array').map((n) => n.id);

// ---------------------------------------------------------------------------
console.log('\n[fuzz] random gesture workflows hold all invariants');

for (const seed of [1, 7, 42, 1337, 90210]) {
  test(`seed ${seed}: 1200 random gestures stay well-formed`, () => {
    const rnd = rng(seed);
    const state = CS.createState({ levels });

    for (let step = 0; step < 1200; step++) {
      const arrs  = arrayIds(state);
      const loose = looseIds(state);
      const op = Math.floor(rnd() * 9);

      if (op === 0 || state.nodes.size === 0) {
        CS.addDisk(state, pick(rnd, SIZES));
      } else if (op === 1 && loose.length >= 2) {
        const a = pick(rnd, loose); let b = pick(rnd, loose);
        if (a !== b) CS.group(state, [a, b]);
      } else if (op === 2 && arrs.length && loose.length) {
        const arr = pick(rnd, arrs); const m = pick(rnd, loose);
        if (m !== arr) CS.addToArray(state, arr, m);          // disk OR array → nesting
      } else if (op === 3 && arrs.length) {
        CS.setSegmentation(state, pick(rnd, arrs), pick(rnd, SEGS));
      } else if (op === 4 && arrs.length) {
        CS.setRedundancy(state, pick(rnd, arrs), pick(rnd, REDS));
      } else if (op === 5 && arrs.length) {
        CS.dissolve(state, pick(rnd, arrs));
      } else if (op === 6 && state.nodes.size) {
        CS.remove(state, pick(rnd, Array.from(state.nodes.keys())));
      } else if (op === 7 && arrs.length >= 2) {
        const a = pick(rnd, arrs); let b = pick(rnd, arrs);
        if (a !== b) CS.group(state, [a, b]);                 // merge two arrays (nest)
      } else {
        CS.addDisk(state, pick(rnd, SIZES));
      }

      let result;
      assert((() => { result = CS.evaluate(state, { stripes: 4 }); return true; })(),
        `seed ${seed} step ${step}: evaluate threw`);                                  // I6
      checkInvariants(state, result, `seed ${seed} step ${step}`);                     // I1–I5
      if (result.rootCount === 1 && result.tree) assert(result.analysis, `I7 step ${step}`);
    }
  });
}

// ---------------------------------------------------------------------------
console.log('\n[scenario] the reported flow: two arrays → merge → delete → re-add');

test('after merging, deleting and re-adding, a valid RAID 6 is recognized again', () => {
  const s = CS.createState({ levels });
  // Two separate arrays.
  const A = CS.group(s, [CS.addDisk(s, 4), CS.addDisk(s, 4), CS.addDisk(s, 4)]);
  const B = CS.group(s, [CS.addDisk(s, 4), CS.addDisk(s, 4), CS.addDisk(s, 4)]);
  CS.setSegmentation(s, A, 'striped'); CS.setRedundancy(s, A, 'parity1');
  CS.setSegmentation(s, B, 'striped'); CS.setRedundancy(s, B, 'parity1');
  // Merge into one nested parent, then tear it apart and rebuild flat.
  const P = CS.group(s, [A, B]);
  CS.evaluate(s);
  CS.dissolve(s, A); CS.dissolve(s, B);          // inner arrays back to loose disks
  CS.remove(s, P);                               // drop the now-empty parent
  // Delete two disks, add two fresh ones.
  const present = looseIds(s);
  CS.remove(s, present[0]); CS.remove(s, present[1]);
  const fresh = [CS.addDisk(s, 4), CS.addDisk(s, 4)];
  // Group everything that's loose into one flat array → RAID 6.
  const all = looseIds(s);
  const F = CS.group(s, all);
  CS.setSegmentation(s, F, 'striped'); CS.setRedundancy(s, F, 'parity2');
  const r = CS.evaluate(s);
  assert(r.rootCount === 1, `expected one root, got ${r.rootCount}`);
  assert(r.analysis && r.analysis.level === 'RAID 6',
    `expected RAID 6, got ${r.analysis && r.analysis.level}`);
  assert(r.analysis.faultTolerance === 2, 'RAID 6 should survive 2 failures');
});

// ---------------------------------------------------------------------------
finish();
