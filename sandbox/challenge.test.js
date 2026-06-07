/**
 * challenge.test.js — headless tests for the requirement-satisfaction win-check.
 * Run with: node challenge.test.js
 *
 * Requirement fixtures are kept in sync with data/challenges/*.yaml by hand
 * (inline, so the test has no fetch/js-yaml dependency — matching the other tests).
 * The canonical solution trees below use the inventories from those YAMLs.
 */

const M = require('./model.js');
const C = require('./challenge.js');

let passed = 0, failed = 0;
function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (e) { console.error(`  ✗ ${label}`); console.error(`    ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b) { assert(a === b, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

const d = (n = 2) => M.disk(`d${Math.random()}`, n);
const disks = (k, n = 2) => Array.from({ length: k }, () => d(n));
const ev = (tree, hard = []) => ({ analysis: M.analyze(tree), violations: { hard, soft: [] } });

// --- requirement fixtures (mirror data/challenges/*.yaml) ------------------
const CH = {
  speed:     { requirements: [ { metric: 'readClass', op: 'in', value: ['high'] },
                               { metric: 'writeClass', op: 'in', value: ['high'] } ] },
  mirror:    { requirements: [ { metric: 'faultTolerance', op: '>=', value: 1 } ] },
  balanced:  { requirements: [ { metric: 'faultTolerance', op: '>=', value: 1 },
                               { metric: 'capacityGB', op: '>=', value: 6 } ] },
  resilient: { requirements: [ { metric: 'faultTolerance', op: '>=', value: 2 } ] },
  database:  { requirements: [ { metric: 'faultTolerance', op: '>=', value: 1 },
                               { metric: 'readClass', op: 'in', value: ['high'] },
                               { metric: 'writeClass', op: 'in', value: ['high'] } ] },
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
console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
