/**
 * levels-oracle.test.js — the hand-written recognizer as ORACLE for the data-driven one.
 * Run with: node levels-oracle.test.js
 *
 * On 2026-09-02 `RaidModel.recognize` stopped being a decision procedure and
 * became a shape match against data/raid-levels/*.yaml. This suite keeps the
 * old function verbatim (below, `legacy`) and asserts that the new one gives
 * the same name on every tree in a systematic enumeration: every leaf
 * (segmentation × redundancy × 1–6 disks), every uniform nesting over those
 * leaves (2–3 spans), mixed spans, and depth-2 nesting.
 *
 * TWO divergences are intended and asserted as such — both places where the
 * data is stricter than the code was, on purpose:
 *   1. the legacy nested-mirror rule ignored the parent's segmentation, so a
 *      `striped + mirror` over spans was called RAID 51 / 61 / 0+1 too. The
 *      level files say those are `linear + mirror` (a mirror of legs);
 *   2. the legacy child token for a parity span ignored the span's segmentation,
 *      so a stripe (or mirror) over `linear + parity` spans — spans the legacy
 *      code itself refused to name — was called RAID 50 / 60 / 51 / 61. The
 *      level files say a RAID 50 span is a RAID 5, i.e. `striped + parity1`.
 * A composition whose spans have no name has no name either.
 *
 * Keep this suite: it is the migration proof, and the enumeration is a useful
 * property test for any future change to the shapes.
 */

const M = require('../src/engine/model.js');
const L = require('../src/engine/levels.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

const levels = L.createLevels(require('./fixtures/raid-levels.js'));

// ---------------------------------------------------------------------------
// The recognizer as it was in model.js before 2026-09-02 (verbatim logic).
// ---------------------------------------------------------------------------
function legacy(node) {
  const isDisk  = (n) => n && n.kind === 'disk';
  const isArray = (n) => n && n.kind === 'array';
  const allDisks  = (arr) => arr.members.length > 0 && arr.members.every(isDisk);
  const allArrays = (arr) => arr.members.length > 0 && arr.members.every(isArray);
  const isStripedDiskMirror = (n) =>
    isArray(n) && n.segmentation === 'striped' && n.redundancy === 'mirror' && allDisks(n);
  const childToken = (m) => {
    if (!allDisks(m)) return '∗';
    if (m.redundancy === 'none')   return m.segmentation === 'striped' ? 'r0' : 'jbod';
    if (m.redundancy === 'mirror') {
      if (!isStripedDiskMirror(m)) return 'mirror';
      return m.members.length % 2 === 0 ? 'r10' : 'r1e';
    }
    return m.redundancy;
  };
  const uniformToken = (members) => {
    const tokens = members.map(childToken);
    return tokens.every((t) => t === tokens[0]) ? tokens[0] : null;
  };
  const mk = (level, notRaid = false) => ({ level, notRaid });

  if (isDisk(node)) return mk(null);
  const { segmentation: seg, redundancy: red } = node;
  if (allDisks(node)) {
    if (red === 'none')    return seg === 'striped' ? mk('RAID 0') : mk('JBOD / spanned', true);
    if (red === 'mirror') {
      if (seg === 'linear') return mk('RAID 1');
      return node.members.length % 2 === 0 ? mk('RAID 10') : mk('RAID 1E');
    }
    if (red === 'parity1') return seg === 'striped' ? mk('RAID 5') : mk(null);
    if (red === 'parity2') return seg === 'striped' ? mk('RAID 6') : mk(null);
  }
  if (seg === 'striped' && red === 'none' && allArrays(node)) {
    switch (uniformToken(node.members)) {
      case 'mirror':  return mk('RAID 1+0');
      case 'r10':     return mk('RAID 100');
      case 'parity1': return mk('RAID 50');
      case 'parity2': return mk('RAID 60');
    }
  }
  if (red === 'mirror' && allArrays(node)) {
    switch (uniformToken(node.members)) {
      case 'r0':      return mk('RAID 0+1');
      case 'parity1': return mk('RAID 51');
      case 'parity2': return mk('RAID 61');
    }
  }
  return mk(null);
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------
const SEGS = M.SEGMENTATIONS;
const REDS = M.REDUNDANCIES;
const disks = (k) => Array.from({ length: k }, (_, i) => M.disk(`d${i}`, 2));
const arr   = (seg, red, members) => M.array(seg, red, members);

const leaves = [];
for (const seg of SEGS) for (const red of REDS) for (let n = 1; n <= 6; n++)
  leaves.push({ label: `${seg}+${red}×${n}`, make: () => arr(seg, red, disks(n)) });

const trees = leaves.map((l) => ({ label: l.label, tree: l.make() }));
for (const seg of SEGS) for (const red of REDS) {
  for (const l of leaves) for (const k of [2, 3])
    trees.push({ label: `${seg}+${red} over ${k}×(${l.label})`,
                 tree: arr(seg, red, Array.from({ length: k }, l.make)) });
  // mixed spans
  trees.push({ label: `${seg}+${red} over (R5, R6)`,
               tree: arr(seg, red, [arr('striped', 'parity1', disks(3)), arr('striped', 'parity2', disks(4))]) });
  trees.push({ label: `${seg}+${red} over (R10 even, R1E odd)`,
               tree: arr(seg, red, [arr('striped', 'mirror', disks(4)), arr('striped', 'mirror', disks(3))]) });
  trees.push({ label: `${seg}+${red} over (R1 pair, disk)`,
               tree: arr(seg, red, [arr('linear', 'mirror', disks(2)), M.disk('x', 2)]) });
  // depth 2
  trees.push({ label: `${seg}+${red} over 2×(stripe over 2×R1)`,
               tree: arr(seg, red, [
                 arr('striped', 'none', [arr('linear', 'mirror', disks(2)), arr('linear', 'mirror', disks(2))]),
                 arr('striped', 'none', [arr('linear', 'mirror', disks(2)), arr('linear', 'mirror', disks(2))])]) });
}

// The intended divergences (see the header): the legacy rule named the parent
// although (1) the parent is a striped mirror over spans, or (2) at least one
// span has no legacy name of its own.
const intendedDivergence = (t) => {
  const nested = t.members.length > 0 && t.members.every((m) => m.kind === 'array');
  if (!nested || legacy(t).level === null) return false;
  const stripedMirrorParent = t.segmentation === 'striped' && t.redundancy === 'mirror';
  const unnamedSpan = t.members.some((m) => legacy(m).level === null);
  return stripedMirrorParent || unnamedSpan;
};

console.log(`\n[1] ${trees.length} trees: data-driven == legacy (except the intended divergence)`);

let agreed = 0, diverged = 0;
for (const { label, tree } of trees) {
  const want = legacy(tree);
  const got  = M.recognize(tree, levels);
  if (intendedDivergence(tree)) {
    diverged++;
    test(`INTENDED: ${label} — legacy said ${want.level}, data says no canonical name`, () => {
      eq(got.level, null);
      eq(got.flag, 'non-standard-config');
    });
    continue;
  }
  agreed++;
  test(`${label} → ${want.level === null ? 'unnamed' : want.level}`, () => {
    eq(got.level, want.level);
    eq(got.notRaid, want.notRaid);
    eq(got.recognized, want.level !== null);
  });
}

test('the enumeration covered both agreement and the intended divergence', () => {
  assert(agreed > 100, `only ${agreed} agreeing trees`);
  assert(diverged >= 3, `only ${diverged} intended divergences (expected 0+1, 51, 61 at least)`);
});

finish();
