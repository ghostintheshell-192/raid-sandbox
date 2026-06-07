/**
 * challenge-data.test.js — validates the REAL challenge YAML files.
 * Run with: node challenge-data.test.js   (uses python3 + pyyaml to read YAML;
 * this repo is zero-dependency and Node has no YAML parser, so python is the reader.)
 *
 * This is the guard that lets challenges be added without breaking the game:
 * every file must parse, satisfy RaidChallenge.validateChallenge (known metrics/ops,
 * required fields), and stay consistent with index.yaml. A malformed challenge
 * fails HERE, loudly — never silently as an unwinnable level.
 */

const path = require('path');
const { execFileSync } = require('child_process');
const C = require('./challenge.js');

let passed = 0, failed = 0;
function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (e) { console.error(`  ✗ ${label}`); console.error(`    ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// Read every challenge YAML through pyyaml → JSON (the repo's available parser).
const dir = path.join(__dirname, '..', 'data', 'challenges');
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
  console.error('Could not read challenge YAML via python3/pyyaml:', e.message);
  process.exit(1);
}

const indexFile  = files['index.yaml'];
const challenges = Object.entries(files)
  .filter(([name]) => name !== 'index.yaml')
  .map(([name, doc]) => ({ name, doc }));

// ---------------------------------------------------------------------------
console.log('\n[1] Every challenge file is structurally valid');

for (const { name, doc } of challenges) {
  test(`${name} passes validateChallenge`, () => {
    const problems = C.validateChallenge(doc);
    assert(problems.length === 0, problems.join('; '));
  });
  test(`${name}: id matches filename`, () => {
    assert(doc.id === name.replace(/\.yaml$/, ''), `id "${doc.id}" ≠ file "${name}"`);
  });
}

// ---------------------------------------------------------------------------
console.log('\n[2] index.yaml stays in sync with the files');

test('index.yaml is a non-empty list of {id,title}', () => {
  assert(Array.isArray(indexFile) && indexFile.length > 0, 'index must be a non-empty list');
  indexFile.forEach((e, i) => { assert(e.id && e.title, `index[${i}] needs id + title`); });
});

test('every indexed challenge has a matching file (and vice-versa)', () => {
  const fileIds  = new Set(challenges.map((c) => c.doc.id));
  const indexIds = new Set(indexFile.map((e) => e.id));
  for (const id of indexIds) assert(fileIds.has(id),  `index lists "${id}" but no file has it`);
  for (const id of fileIds)  assert(indexIds.has(id), `file "${id}" is not listed in index.yaml`);
});

test('index titles match the challenge files', () => {
  const byId = Object.fromEntries(challenges.map((c) => [c.doc.id, c.doc.title]));
  for (const e of indexFile)
    assert(byId[e.id] === e.title, `title drift for "${e.id}": index "${e.title}" ≠ file "${byId[e.id]}"`);
});

// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
