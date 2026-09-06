/**
 * kb-worked.test.js — the worked calculation on a knowledge-base level page
 * cannot contradict the engine.
 * Run with: node kb-worked.test.js   (uses python3 + pyyaml to read YAML, like
 * the other data suites.)
 *
 * A level page prints its capacity, fault tolerance and write penalty as a
 * derivation: words from the level file, numbers from `model.js` on the level's
 * `kb.example`. The words carry a formula, and a formula written by a human next
 * to a number computed by code is exactly the pair that drifts
 * (tech-debt/level-numbers-duplicated-untested.md). So:
 *
 *   1. `reference.capacityTemplate` — the capacity formula written so a machine
 *      can read it — is EVALUATED on the example and must equal
 *      `model.capacityGB()` on the tree that example builds. The evaluator is
 *      .development/scripts/lib/capacity-template.js: a closed grammar parsed by
 *      hand, never `eval`;
 *   2. `reference.writePenalty.random` and `.sequential` must equal what the
 *      engine derives for that same tree.
 *
 * What this file does NOT check: `reference.faultToleranceAtMinimum`, which
 * raid-levels-data.test.js already holds against the engine at `minDisks` — a
 * second comparison here would be a second place to update, not a second guard.
 * It also does not check that the example is the right level: that is
 * kb-data.test.js's §5.
 */

const path = require('path');
const { execFileSync } = require('child_process');
const M = require('../src/engine/model.js');
const { evaluate } = require('../.development/scripts/lib/capacity-template.js');
const { sequentialPenalty } = require('../.development/scripts/lib/write-penalty.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

const dir = path.join(__dirname, '..', 'data', 'raid-levels');
const PY = `
import yaml, json, os, sys
base = sys.argv[1]
out = {}
for f in sorted(os.listdir(base)):
    if f.endswith('.yaml') and f != 'index.yaml':
        with open(os.path.join(base, f)) as fh: out[f[:-5]] = yaml.safe_load(fh)
print(json.dumps(out))
`;
let files;
try {
  files = JSON.parse(execFileSync('python3', ['-c', PY, dir], { encoding: 'utf8' }));
} catch (e) {
  console.error('Could not read raid-levels YAML via python3/pyyaml:', e.message);
  process.exit(1);
}

// Only the levels that have a page: the example is what the template is
// evaluated on, and a level with no `kb:` block has none.
const pages = Object.keys(files).filter((id) => files[id].kb).sort();

/** The tree a level's `kb.example` describes — built exactly as the page's is. */
function exampleTree(doc) {
  const ex = doc.kb.example;
  const disks = Array.from({ length: ex.disks }, (_, i) => M.disk(`disk-${i + 1}`, ex.sizeGB, ex.protocol || 'SATA'));
  const node = M.array(doc.shape.segmentation, doc.shape.redundancy, disks, ex.algorithm ?? null);
  if (doc.shape.copies) node.copies = doc.shape.copies;
  return node;
}

// ---------------------------------------------------------------------------
console.log('\n[1] the capacity template is evaluable, and agrees with the engine');

test('every level with a page declares reference.capacityTemplate', () => {
  for (const id of pages) {
    const ref = files[id].reference || {};
    assert(typeof ref.capacityTemplate === 'string' && ref.capacityTemplate.trim(),
      `${id}: a level with a page needs reference.capacityTemplate (the evaluable form of capacityFormula)`);
  }
});

for (const id of pages) {
  const doc = files[id];
  test(`${id}: "${doc.reference.capacityTemplate}" on the example equals model.capacityGB()`, () => {
    const node = exampleTree(doc);
    const vars = { N: M.countDisks(node), size: doc.kb.example.sizeGB };
    if (doc.shape.copies) vars.copies = doc.shape.copies;
    eq(evaluate(doc.reference.capacityTemplate, vars, `${id}.yaml reference.capacityTemplate`),
       M.capacityGB(node));
  });
}

// The evaluator is the thing standing between a formula and a number, so its
// own refusals are worth a line: a template that reaches outside the grammar
// must fail, not quietly return something.
test('the evaluator refuses what is not in the grammar', () => {
  const vars = { N: 4, size: 2 };
  eq(evaluate('(N - 1) * size', vars), 6);
  eq(evaluate('N / 2 * size', vars), 4);
  for (const bad of ['N * unknownName', 'process.exit(1)', 'N *', '(N - 1', 'N # 2', '']) {
    let threw = false;
    try { evaluate(bad, vars); } catch (e) { threw = true; }
    assert(threw, `"${bad}" should have been refused`);
  }
});

// ---------------------------------------------------------------------------
console.log('\n[2] reference.writePenalty agrees with the engine on the example');

for (const id of pages) {
  const doc = files[id];
  test(`${id}: reference.writePenalty.random matches the engine`, () => {
    const ref = (doc.reference || {}).writePenalty;
    assert(ref && typeof ref.random === 'number', `${id}: reference.writePenalty.random is missing`);
    eq(M.performance(exampleTree(doc)).writePenalty, ref.random);
  });
  test(`${id}: reference.writePenalty.sequential matches the engine`, () => {
    const ref = (doc.reference || {}).writePenalty;
    assert(ref && typeof ref.sequential === 'number', `${id}: reference.writePenalty.sequential is missing`);
    eq(sequentialPenalty(M.performance(exampleTree(doc)), `${id}.yaml`), ref.sequential);
  });
}

finish();
