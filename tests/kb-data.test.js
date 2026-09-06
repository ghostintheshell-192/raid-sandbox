/**
 * kb-data.test.js — validates the REAL knowledge-base data: data/kb/*.yaml and
 * the `kb:` block on the level files.
 * Run with: node kb-data.test.js   (uses python3 + pyyaml to read YAML; this repo
 * is zero-dependency and Node has no YAML parser, so python is the reader. The
 * generator may use the vendored parser — it is not a test.)
 *
 * What it guards, and why each guard is here rather than in the generator:
 *
 *   1. the shape of an entry — id, kind, name, short, sources, long, status,
 *      related. The generator refuses to write a page from a broken entry, but
 *      only for the entries a page happens to use; this holds every file in the
 *      directory, including one nothing links to yet;
 *   2. every cross-reference resolves — `related`, `confusedWith` and every
 *      [[id]] / [[id|text]] in a long form. A dangling link is the one failure
 *      that turns a knowledge base into a maze, and it is cheap to catch here;
 *   3. `short` is plain text. It is transcluded verbatim into every level page
 *      and shown by the sandbox's information icons, neither of which renders
 *      markdown — so a `**bold**` or a [[link]] in a short form would be read
 *      out as its own punctuation;
 *   4. the level `kb:` blocks are complete, and each `example` BUILDS with the
 *      engine and is recognized as that level. An example that is quietly a
 *      RAID 1 would put a mirror's grid and a mirror's numbers on the RAID 5
 *      page — the exact failure the generated pages exist to prevent.
 *
 * The arithmetic of the worked calculation is kb-worked.test.js's job, not this
 * file's; `faultToleranceAtMinimum` is raid-levels-data.test.js's and is not
 * duplicated here.
 */

const path = require('path');
const { execFileSync } = require('child_process');
const M = require('../src/engine/model.js');
const L = require('../src/engine/levels.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

const root = path.join(__dirname, '..');
const PY = `
import yaml, json, os, sys
base = sys.argv[1]
def read(d):
    out = {}
    for f in sorted(os.listdir(d)):
        if f.endswith('.yaml') and f != 'index.yaml':
            with open(os.path.join(d, f)) as fh: out[f[:-5]] = yaml.safe_load(fh)
    return out
levels_dir = os.path.join(base, 'data', 'raid-levels')
with open(os.path.join(levels_dir, 'index.yaml')) as fh: index = yaml.safe_load(fh)
print(json.dumps({ 'kb': read(os.path.join(base, 'data', 'kb')),
                   'levels': read(levels_dir), 'index': index }))
`;
let data;
try {
  data = JSON.parse(execFileSync('python3', ['-c', PY, root], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
} catch (e) {
  console.error('Could not read the knowledge-base YAML via python3/pyyaml:', e.message);
  process.exit(1);
}
const { kb, levels: levelFiles, index } = data;

const levels     = L.createLevels(L.assemble(index, levelFiles));
const kbIds      = new Set(Object.keys(kb));
const pageIds    = new Set(Object.keys(levelFiles).filter((id) => levelFiles[id].kb));
const levelIds   = new Set(Object.keys(levelFiles));
const KINDS      = ['concept', 'term'];
const STATUSES   = ['written', 'to-verify'];

// A reference resolves to a knowledge-base entry or to a level that has a page.
// The lookup is case-insensitive: the prose capitalises a reference that opens a
// sentence ([[Redundancy]]), and the generator resolves it the same way.
const resolves = (id) => {
  const lower = String(id).toLowerCase();
  return kbIds.has(id) || kbIds.has(lower) || pageIds.has(id) || pageIds.has(lower);
};

/** Every [[id]] / [[id|text]] in a body of markdown, in order. */
const references = (text) =>
  [...String(text || '').matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim());

// ---------------------------------------------------------------------------
console.log('\n[1] every data/kb entry has the fields a page is built from');

for (const id of [...kbIds].sort()) {
  const doc = kb[id];
  test(`data/kb/${id}.yaml: id, kind, name, short, sources, status, related`, () => {
    eq(doc.id, id);
    assert(KINDS.includes(doc.kind), `kind "${doc.kind}" is not one of ${KINDS.join(', ')}`);
    assert(typeof doc.name === 'string' && doc.name.trim(), 'name is required');
    assert(typeof doc.short === 'string' && doc.short.trim(), 'short is required');
    assert(Array.isArray(doc.sources) && doc.sources.length > 0, 'sources is required and cannot be empty');
    assert(doc.sources.every((s) => typeof s === 'string' && s.trim()), 'every source is a non-empty string');
    assert(STATUSES.includes(doc.status), `status "${doc.status}" is not one of ${STATUSES.join(', ')}`);
    assert(Array.isArray(doc.related), 'related is required (an empty list is allowed, a missing one is not)');
  });
}

test('a concept has a long form; a term does not', () => {
  for (const id of kbIds) {
    const doc = kb[id];
    if (doc.kind === 'concept') assert(typeof doc.long === 'string' && doc.long.trim(), `${id}: a concept needs a long form`);
    else assert(doc.long === undefined, `${id}: a term has only a short form — move the long one or make it a concept`);
  }
});

// ---------------------------------------------------------------------------
console.log('\n[2] `short` is plain text — it is transcluded, never rendered');

for (const id of [...kbIds].sort()) {
  test(`data/kb/${id}.yaml: short carries no markdown a reader would see raw`, () => {
    const short = kb[id].short;
    assert(!short.includes('**'), 'short must not use **bold** — nothing renders it');
    assert(!short.includes('[['), 'short must not use [[links]] — it is transcluded as text');
    assert(!short.includes('##'), 'short must not carry a heading');
  });
}

// ---------------------------------------------------------------------------
console.log('\n[3] every cross-reference resolves');

for (const id of [...kbIds].sort()) {
  const doc = kb[id];
  test(`data/kb/${id}.yaml: related ids exist`, () => {
    for (const rid of doc.related) assert(resolves(rid), `related "${rid}" names no entry and no level page`);
  });
  test(`data/kb/${id}.yaml: every [[reference]] in the long form exists`, () => {
    for (const rid of references(doc.long)) assert(resolves(rid), `[[${rid}]] names no entry and no level page`);
  });
}

// ---------------------------------------------------------------------------
console.log('\n[4] the level `kb:` blocks are complete');

const WORKED = ['capacity', 'faultTolerance', 'writePenalty'];

for (const id of [...pageIds].sort()) {
  const doc = levelFiles[id];
  const b = doc.kb;
  test(`${id}.yaml: pros, cons, useCases, notFor are text (a ": " makes YAML read a mapping)`, () => {
    for (const field of ['pros', 'cons', 'useCases', 'notFor'])
      for (const x of doc[field] || [])
        assert(typeof x === 'string', `${id}: ${field} has a non-text item — quote it: ${JSON.stringify(x)}`);
  });

  test(`${id}.yaml: kb has short, long, example, worked, related, confusedWith`, () => {
    assert(typeof b.short === 'string' && b.short.trim(), 'kb.short is required');
    assert(typeof b.long === 'string' && b.long.trim(), 'kb.long is required');
    assert(b.example && typeof b.example === 'object', 'kb.example is required');
    assert(typeof b.example.disks === 'number' && b.example.disks >= 2, 'kb.example.disks must be a count of at least 2');
    assert(typeof b.example.sizeGB === 'number' && b.example.sizeGB > 0, 'kb.example.sizeGB must be a positive number');
    assert(b.worked && typeof b.worked === 'object', 'kb.worked is required');
    for (const key of WORKED) assert(typeof b.worked[key] === 'string' && b.worked[key].trim(), `kb.worked.${key} is required`);
    assert(Array.isArray(b.related), 'kb.related is required');
    assert(Array.isArray(b.confusedWith), 'kb.confusedWith is required (an empty list is allowed)');
  });

  test(`${id}.yaml: kb.short is plain text`, () => {
    assert(!b.short.includes('**') && !b.short.includes('[['), 'kb.short must carry no markdown');
  });

  test(`${id}.yaml: kb.related and every [[reference]] in kb.long resolve`, () => {
    for (const rid of b.related) assert(resolves(rid), `kb.related "${rid}" names no entry and no level page`);
    for (const rid of references(b.long)) assert(resolves(rid), `[[${rid}]] names no entry and no level page`);
  });

  test(`${id}.yaml: kb.confusedWith names level files`, () => {
    for (const rid of b.confusedWith) {
      assert(levelIds.has(rid), `kb.confusedWith "${rid}" is no level file`);
      assert(rid !== id, 'a level is not confused with itself');
    }
  });
}

// ---------------------------------------------------------------------------
console.log('\n[5] every example builds, and is the level whose page it illustrates');

for (const id of [...pageIds].sort()) {
  const doc = levelFiles[id];
  const ex  = doc.kb.example;
  test(`${id}.yaml: kb.example builds with the engine and is recognized as ${id}`, () => {
    assert(doc.shape.members === 'disks', 'a page example is defined for leaf levels only');
    const disks = Array.from({ length: ex.disks }, (_, i) => M.disk(`disk-${i + 1}`, ex.sizeGB, ex.protocol || 'SATA'));
    const node  = M.array(doc.shape.segmentation, doc.shape.redundancy, disks, ex.algorithm ?? null);
    if (doc.shape.copies) node.copies = doc.shape.copies;
    const named = levels.match(node);
    assert(named, 'the example has no name in the catalogue');
    eq(named.id, id);
  });

  test(`${id}.yaml: kb.example.algorithm is one the level's class offers`, () => {
    const hasAxis = !!doc.defaultAlgorithm;
    if (!hasAxis) assert(ex.algorithm == null, `${id} has no algorithm axis, so the example must not name one`);
    else assert(typeof ex.algorithm === 'string' && ex.algorithm, `${id} has an algorithm axis, so the example must name a layout`);
  });
}

finish();
