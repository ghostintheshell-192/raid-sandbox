/**
 * challenge.test.js — headless tests for the requirement-satisfaction win-check.
 * Run with: node challenge.test.js
 *
 * Requirement fixtures are kept in sync with data/challenges/*.yaml by hand
 * (inline, so the test has no fetch/js-yaml dependency — matching the other tests).
 * The canonical solution trees below use the inventories from those YAMLs.
 */

const M = require('../src/engine/model.js');
const C = require('../src/challenge/challenge.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

const d = (n = 2) => M.disk(`d${Math.random()}`, n);
const disks = (k, n = 2) => Array.from({ length: k }, () => d(n));
const ev = (tree, hard = []) => ({ analysis: M.analyze(tree), violations: { hard, soft: [] } });

// --- requirement fixtures (mirror data/challenges/*.yaml) ------------------
const ANY = { diskCount: 'any', rawCapacityGB: 'any', capacityGB: 'any',
              faultTolerance: 'any', readClass: 'any', writeClass: 'any' };
const CH = {
  speed:     { requirements: { ...ANY, diskCount: { op: '==', value: 3 },
                               readClass: { op: 'in', value: ['high'] },
                               writeClass: { op: 'in', value: ['high'] } } },
  mirror:    { requirements: { ...ANY, diskCount: { op: '==', value: 2 },
                               rawCapacityGB: { op: '==', value: 4 },
                               faultTolerance: { op: '>=', value: 1 } } },
  balanced:  { requirements: { ...ANY, diskCount: { op: '==', value: 4 },
                               rawCapacityGB: { op: '==', value: 8 },
                               capacityGB: { op: '>=', value: 6 },
                               faultTolerance: { op: '>=', value: 1 } } },
  resilient: { requirements: { ...ANY, diskCount: { op: '==', value: 6 },
                               rawCapacityGB: { op: '==', value: 24 },
                               faultTolerance: { op: '>=', value: 2 } } },
  database:  { requirements: { ...ANY, diskCount: { op: '==', value: 4 },
                               faultTolerance: { op: '>=', value: 1 },
                               readClass: { op: 'in', value: ['high'] },
                               writeClass: { op: 'in', value: ['high'] } } },
};

// --- canonical solution trees (from each challenge's inventory) -------------
const SOL = {
  speed:     M.array('striped', 'none',    disks(3)),       // RAID 0
  mirror:    M.array('linear',  'mirror',  disks(2)),       // RAID 1
  balanced:  M.array('striped', 'parity1', disks(4)),       // RAID 5 → cap 6
  resilient: M.array('striped', 'parity2', disks(6, 4)),    // RAID 6 → FT 2
  database:  M.array('striped', 'mirror',  disks(4)),       // RAID 10
};

// ---------------------------------------------------------------------------
console.log('\n[1] Each challenge’s canonical solution satisfies it');

for (const id of Object.keys(CH)) {
  test(`${id} → satisfied by its canonical build`, () => {
    const r = C.checkChallenge(CH[id], ev(SOL[id]));
    assert(r.satisfied, `expected satisfied; failing reqs: ` +
      r.requirements.filter((x) => !x.met).map((x) => `${x.label} (got ${x.actual})`).join(', '));
  });
}

// ---------------------------------------------------------------------------
console.log('\n[2] Wrong builds fail — and say which requirement');

test('database NOT satisfied by RAID 5 (write penalty)', () => {
  const r = C.checkChallenge(CH.database, ev(M.array('striped', 'parity1', disks(4))));
  assert(!r.satisfied);
  const w = r.requirements.find((x) => x.metric === 'writeClass');
  assert(w && !w.met, 'the writeClass requirement should be the one unmet');
  eq(w.actual, 'medium');
});

test('balanced NOT satisfied by RAID 10 (capacity bar)', () => {
  const r = C.checkChallenge(CH.balanced, ev(M.array('striped', 'mirror', disks(4))));
  assert(!r.satisfied);
  const cap = r.requirements.find((x) => x.metric === 'capacityGB');
  assert(cap && !cap.met);
  eq(cap.actual, 4);   // RAID 10 of 4×2 = 4, below the 6 bar
});

test('resilient NOT satisfied by RAID 5 (only FT 1)', () => {
  const r = C.checkChallenge(CH.resilient, ev(M.array('striped', 'parity1', disks(6, 4))));
  assert(!r.satisfied);
});

test('resilient NOT satisfied by 6×2TB RAID 6 — the reported size bug', () => {
  const r = C.checkChallenge(CH.resilient, ev(M.array('striped', 'parity2', disks(6, 2))));
  assert(!r.satisfied);
  const raw = r.requirements.find((x) => x.metric === 'rawCapacityGB');
  assert(raw && !raw.met, 'raw capacity should be the unmet requirement');
  eq(raw.actual, 12);                                   // 6×2 = 12, not the required 24
  assert(r.requirements.find((x) => x.metric === 'faultTolerance').met,
    'FT is fine — it is the disk SIZE that now catches this, not redundancy');
});

test('resilient NOT satisfied by 4×4TB RAID 6 — wrong disk count ("not 4, not 8")', () => {
  const r = C.checkChallenge(CH.resilient, ev(M.array('striped', 'parity2', disks(4, 4))));
  assert(!r.satisfied);
  const dc = r.requirements.find((x) => x.metric === 'diskCount');
  assert(dc && !dc.met); eq(dc.actual, 4);
});

// ---------------------------------------------------------------------------
console.log('\n[3] A hard violation blocks the win even with matching numbers');

test('database numbers met but a hard violation → not satisfied (blockedBy)', () => {
  const hard = [{ code: 'min-disks', severity: 'hard', message: 'x', nodeId: null, source: 's' }];
  const r = C.checkChallenge(CH.database, ev(SOL.database, hard));
  assert(!r.satisfied, 'a hard violation must block the win');
  eq(r.blockedBy.length, 1);
  assert(r.requirements.every((x) => x.met), 'the numeric/class requirements still individually pass');
});

// ---------------------------------------------------------------------------
console.log('\n[4] Empty / incomplete builds');

test('no analysis (incomplete build) → not satisfied', () => {
  const r = C.checkChallenge(CH.speed, { analysis: null, violations: { hard: [], soft: [] } });
  assert(!r.satisfied);
});

// ---------------------------------------------------------------------------
console.log('\n[5] validateChallenge guards malformed challenges');

const goodReqs = { ...ANY, diskCount: { op: '==', value: 3 } };
const goodCh   = { id: 'x', title: 'X', prompt: 'p', requirements: goodReqs };

test('a complete, well-formed challenge has no problems', () => eq(C.validateChallenge(goodCh).length, 0));
test('a missing metric is rejected (the record must be complete)', () => {
  const reqs = { ...goodReqs }; delete reqs.writeClass;
  assert(C.validateChallenge({ ...goodCh, requirements: reqs }).some((s) => /missing requirement.*writeClass/.test(s)));
});
test('an unknown metric key is rejected (the silent-unwinnable trap)', () => {
  const p = C.validateChallenge({ ...goodCh, requirements: { ...goodReqs, diskSize: 'any' } });
  assert(p.some((s) => /unknown metric/.test(s)), p.join('; '));
});
test('an unknown op is rejected', () => {
  const p = C.validateChallenge({ ...goodCh, requirements: { ...goodReqs, diskCount: { op: '≥', value: 4 } } });
  assert(p.some((s) => /unknown op/.test(s)), p.join('; '));
});
test('requirements must be a map, not a list', () => {
  assert(C.validateChallenge({ id: 'x', title: 'X', prompt: 'p',
    requirements: [{ metric: 'diskCount', op: '==', value: 3 }] }).some((s) => /map/.test(s)));
});
test('all-"any" is rejected (needs at least one real requirement)', () => {
  assert(C.validateChallenge({ ...goodCh, requirements: { ...ANY } }).some((s) => /at least one real/.test(s)));
});
test("'in' needs a list value; comparators need a scalar", () => {
  assert(C.validateChallenge({ ...goodCh, requirements: { ...goodReqs, readClass: { op: 'in', value: 'high' } } }).length > 0);
  assert(C.validateChallenge({ ...goodCh, requirements: { ...goodReqs, diskCount: { op: '==', value: [3] } } }).length > 0);
});
test('all five fixtures are complete and valid', () => {
  for (const id of Object.keys(CH))
    eq(C.validateChallenge({ id, title: id, prompt: 'p', requirements: CH[id].requirements }).length, 0);
});

// ---------------------------------------------------------------------------
finish();
