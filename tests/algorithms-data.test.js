/**
 * algorithms-data.test.js — validates the REAL algorithm YAML files in
 * data/algorithms/.
 * Run with: node algorithms-data.test.js   (uses python3 + pyyaml to read YAML;
 * this repo is zero-dependency and Node has no YAML parser, so python is the
 * reader — same mechanism as components-data.test.js and raid-levels-data.test.js.)
 *
 * This does NOT wire data/algorithms/ into the game. Nothing loads this
 * directory today (spec §5b's parametric algorithm registry is deliberately
 * deferred — placement is computed in src/engine/layout.js, bound to the
 * Linux md golden tables, not read from these files). This test only proves
 * the files are valid data; it does not make them live.
 *
 * Two guards:
 *   1. every .yaml file in the directory parses as YAML — a file broken by an
 *      unquoted colon in a list item (tech-debt/algorithms-data-unvalidated.md)
 *      fails HERE instead of sitting silently broken because nothing reads it;
 *   2. every file that does parse carries the fields the family is expected
 *      to have (id, name, placement, appliesTo), ids match their filename and
 *      are unique, and linuxConstant is present exactly where it is expected
 *      (parity-rotation algorithms have one; the RAID10 copy-placement
 *      algorithms do not — there is no ALGORITHM_* constant for them in the
 *      Linux md source).
 */

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert, eq, finish } = require('./test-helpers.js');

const dir = path.join(__dirname, '..', 'data', 'algorithms');

// Parses each .yaml file independently and reports success/failure per file,
// instead of failing the whole read on the first broken file — the point of
// this suite is to say WHICH files are broken, not just that the directory
// contains one.
const PY = `
import yaml, json, os, sys
base = sys.argv[1]
result = {}
for f in sorted(os.listdir(base)):
    if not f.endswith('.yaml'):
        continue
    stem = f[:-5]
    with open(os.path.join(base, f)) as fh:
        text = fh.read()
    try:
        result[stem] = { 'ok': True, 'doc': yaml.safe_load(text) }
    except yaml.YAMLError as e:
        result[stem] = { 'ok': False, 'error': str(e) }
print(json.dumps(result))
`;

let files;
try {
  files = JSON.parse(execFileSync('python3', ['-c', PY, dir], { encoding: 'utf8' }));
} catch (e) {
  console.error('Could not run the python3/pyyaml reader:', e.message);
  process.exit(1);
}

const stems = Object.keys(files).sort();

// ---------------------------------------------------------------------------
console.log('\n[1] every algorithm file parses as valid YAML');

test('data/algorithms/ has algorithm files to check', () => {
  assert(stems.length > 0, 'no .yaml files found in data/algorithms/');
});

for (const stem of stems) {
  test(`${stem}.yaml parses as valid YAML`, () => {
    assert(files[stem].ok, files[stem].error);
  });
}

// ---------------------------------------------------------------------------
console.log('\n[2] each parsed file carries the fields the family expects');

// Only files that parsed have a usable doc; a file that fails [1] already
// fails the suite and has nothing further to assert against here.
const docs = stems
  .filter((stem) => files[stem].ok)
  .map((stem) => ({ stem, doc: files[stem].doc }));

for (const { stem, doc } of docs) {
  test(`${stem}.yaml: id matches the filename`, () => {
    eq(doc.id, stem);
  });

  test(`${stem}.yaml: name is a non-empty string`, () => {
    assert(typeof doc.name === 'string' && doc.name.length > 0, `${stem}: name`);
  });

  test(`${stem}.yaml: placement is present`, () => {
    assert(doc.placement && typeof doc.placement === 'object' && !Array.isArray(doc.placement),
      `${stem}: placement must be an object`);
  });

  test(`${stem}.yaml: appliesTo is a non-empty list`, () => {
    assert(Array.isArray(doc.appliesTo) && doc.appliesTo.length > 0, `${stem}: appliesTo`);
  });

  // linuxConstant names the ALGORITHM_* value from drivers/md/raid5.h and only
  // exists for parity-rotation algorithms. The RAID10 files (appliesTo:
  // [mirror]) place copies, not parity — there is no such constant for them,
  // so its absence there is legitimate, not a gap.
  const isParityAlgorithm = doc.appliesTo.includes('parity1') || doc.appliesTo.includes('parity2');
  if (isParityAlgorithm) {
    test(`${stem}.yaml: linuxConstant is present (parity-rotation algorithm)`, () => {
      assert(typeof doc.linuxConstant === 'string' && doc.linuxConstant.length > 0, `${stem}: linuxConstant`);
    });
  } else {
    test(`${stem}.yaml: linuxConstant is legitimately absent (RAID10 copy-placement algorithm)`, () => {
      assert(doc.linuxConstant === undefined, `${stem}: unexpected linuxConstant on a non-parity algorithm`);
    });
  }
}

test('ids are unique across the parsed files', () => {
  const seen = new Map();
  for (const { stem, doc } of docs) {
    assert(!seen.has(doc.id), `${stem}.yaml and ${seen.get(doc.id)}.yaml both declare id "${doc.id}"`);
    seen.set(doc.id, stem);
  }
});

finish();
