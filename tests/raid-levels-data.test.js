/**
 * raid-levels-data.test.js — validates the REAL raid-levels YAML files.
 * Run with: node raid-levels-data.test.js   (uses python3 + pyyaml to read YAML;
 * this repo is zero-dependency and Node has no YAML parser, so python is the reader.)
 *
 * Guards the data/raid-levels/ resource family: every file must parse, satisfy the
 * required-field schema, stay consistent with index.yaml, and be cross-referenceable
 * with the recognizer's known shapes. A malformed file fails HERE, loudly.
 */

const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert, finish } = require('./test-helpers.js');

// ---- load all YAML files via pyyaml → JSON (zero-dependency repo pattern) ----

const dir = path.join(__dirname, '..', 'data', 'raid-levels');
const PY = `
import yaml, json, glob, os, sys
out = {}
for f in sorted(glob.glob(os.path.join(sys.argv[1], '*.yaml'))):
    with open(f) as fh: out[os.path.basename(f)] = yaml.safe_load(fh)
print(json.dumps(out))
`;
let files;
try {
  files = JSON.parse(execFileSync('python3', ['-c', PY, dir], { encoding: 'utf8' }));
} catch (e) {
  console.error('Could not read raid-levels YAML via python3/pyyaml:', e.message);
  process.exit(1);
}

const indexFile  = files['index.yaml'];
const levelFiles = Object.entries(files)
  .filter(([name]) => name !== 'index.yaml')
  .map(([name, doc]) => ({ name, doc }));

// Required top-level fields for a raid-level resource.
const REQUIRED_FIELDS    = ['id', 'name', 'shape', 'minDisks', 'faultTolerance', 'capacityFormula'];
const VALID_SEGMENTATIONS = ['striped', 'linear'];
const VALID_REDUNDANCIES  = ['none', 'mirror', 'parity1', 'parity2'];
const VALID_MEMBERS       = ['disks', 'arrays'];

function validateRaidLevel(doc) {
  const problems = [];
  if (!doc || typeof doc !== 'object') return ['document is not an object'];

  for (const f of REQUIRED_FIELDS)
    if (doc[f] === undefined || doc[f] === null) problems.push(`missing required field "${f}"`);

  if (doc.minDisks !== undefined && (typeof doc.minDisks !== 'number' || doc.minDisks < 1))
    problems.push('minDisks must be a positive number');

  if (doc.faultTolerance !== undefined && (typeof doc.faultTolerance !== 'number' || doc.faultTolerance < 0))
    problems.push('faultTolerance must be a non-negative number');

  if (doc.shape && typeof doc.shape === 'object') {
    if (!VALID_SEGMENTATIONS.includes(doc.shape.segmentation))
      problems.push(`shape.segmentation must be one of: ${VALID_SEGMENTATIONS.join(', ')}`);
    if (!VALID_REDUNDANCIES.includes(doc.shape.redundancy))
      problems.push(`shape.redundancy must be one of: ${VALID_REDUNDANCIES.join(', ')}`);
    if (!VALID_MEMBERS.includes(doc.shape.members))
      problems.push(`shape.members must be one of: ${VALID_MEMBERS.join(', ')}`);
  }

  return problems;
}

// ---------------------------------------------------------------------------
console.log('\n[1] Every raid-level file is structurally valid');

for (const { name, doc } of levelFiles) {
  test(`${name} passes schema validation`, () => {
    const problems = validateRaidLevel(doc);
    assert(problems.length === 0, problems.join('; '));
  });
  test(`${name}: id matches filename`, () => {
    assert(doc.id === name.replace(/\.yaml$/, ''), `id "${doc.id}" ≠ file "${name}"`);
  });
}

// ---------------------------------------------------------------------------
console.log('\n[2] index.yaml stays in sync with the files');

test('index.yaml is a non-empty list of {id,name}', () => {
  assert(Array.isArray(indexFile) && indexFile.length > 0, 'index must be a non-empty list');
  indexFile.forEach((e, i) => { assert(e.id && e.name, `index[${i}] needs id + name`); });
});

test('every indexed level has a matching file (and vice-versa)', () => {
  const fileIds  = new Set(levelFiles.map((f) => f.doc.id));
  const indexIds = new Set(indexFile.map((e) => e.id));
  for (const id of indexIds) assert(fileIds.has(id),  `index lists "${id}" but no file has it`);
  for (const id of fileIds)  assert(indexIds.has(id), `file "${id}" is not listed in index.yaml`);
});

test('index names match the level files', () => {
  const byId = Object.fromEntries(levelFiles.map((f) => [f.doc.id, f.doc.name]));
  for (const e of indexFile)
    assert(byId[e.id] === e.name, `name drift for "${e.id}": index "${e.name}" ≠ file "${byId[e.id]}"`);
});

// ---------------------------------------------------------------------------
console.log('\n[3] RAID level domain invariants');

test('RAID levels requiring minDisks ≥ 2 have non-zero minDisks', () => {
  for (const { doc } of levelFiles) {
    if (doc.notRaid) continue;   // JBOD excluded
    assert(doc.minDisks >= 2, `${doc.id}: minDisks must be ≥ 2 for a recognized RAID level`);
  }
});

test('parity levels (parity1/parity2) have defaultAlgorithm set', () => {
  for (const { doc } of levelFiles) {
    if (!doc.shape) continue;
    const red = doc.shape.redundancy;
    if (red === 'parity1' || red === 'parity2')
      assert(doc.defaultAlgorithm,
        `${doc.id}: parity levels must declare a defaultAlgorithm`);
  }
});

test('mirror levels (striped+mirror) have defaultAlgorithm set', () => {
  for (const { doc } of levelFiles) {
    if (!doc.shape) continue;
    if (doc.shape.segmentation === 'striped' && doc.shape.redundancy === 'mirror')
      assert(doc.defaultAlgorithm,
        `${doc.id}: striped+mirror levels must declare a defaultAlgorithm`);
  }
});

test('faultTolerance == 0 only for none-redundancy leaf levels', () => {
  for (const { doc } of levelFiles) {
    if (!doc.shape) continue;
    if (doc.faultTolerance === 0)
      assert(doc.shape.redundancy === 'none',
        `${doc.id}: faultTolerance 0 but redundancy is "${doc.shape.redundancy}"`);
  }
});

// ---------------------------------------------------------------------------
finish();
