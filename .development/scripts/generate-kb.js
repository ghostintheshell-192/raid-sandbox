#!/usr/bin/env node
/**
 * generate-kb.js — RAID Sandbox: the knowledge base, generated from the data.
 *
 * Reads data/kb/, data/raid-levels/, data/algorithms/, data/components/ and
 * data/intro.yaml, and writes kb/index.html (the Map), kb/glossary.html, one
 * page per concept and one page per level that carries a `kb:` block. The pages
 * are committed and served static (specs/planned/knowledge-base.md §7), which is
 * why they carry their text in the HTML and load no script at all.
 *
 * Two rules govern everything below.
 *
 *   Every sentence comes from a data file (ADR-002). This file owns section
 *   headings, navigation labels and page titles; it owns no claim about RAID.
 *   Every number on a level page is computed by the engine on that level's
 *   `kb.example` — never read from the YAML, which is why the page cannot
 *   contradict the sandbox.
 *
 *   It fails loudly. A cross-reference that names nothing, a missing field, an
 *   example the engine refuses, a placeholder with no value: each is a non-zero
 *   exit naming the file. A page with a hole in it is never written.
 *
 * Deterministic by construction: the orders are the lists at the top of this
 * file and the catalogue order of the data, and nothing is stamped with a date.
 * Two runs on the same input produce the same bytes — kb-generator.test.js
 * holds it to that.
 *
 * What it does NOT do: parse the whole of markdown (the subset lives in
 * lib/kb-markdown.js), decide what a level is (levels.js), compute a layout
 * (layout.js) or a number (model.js). It arranges what those return.
 *
 *   node .development/scripts/generate-kb.js [--out <dir>]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT   = path.join(__dirname, '..', '..');
const yaml   = require(path.join(ROOT, 'vendor', 'js-yaml', 'js-yaml.min.js'));
const Model  = require(path.join(ROOT, 'src', 'engine', 'model.js'));
const Levels = require(path.join(ROOT, 'src', 'engine', 'levels.js'));
const Layout = require(path.join(ROOT, 'src', 'engine', 'layout.js'));
const BuildDoc = require(path.join(ROOT, 'src', 'sandbox', 'build-document.js'));
const { render, escapeHtml, slug, headingsOf } = require('./lib/kb-markdown.js');

const fail = (msg) => { throw new Error(msg); };

// ---------------------------------------------------------------------------
// ORDER — the reading order of the knowledge base, kept here as data.
// It is a teaching order, not an alphabet: the four storage layers first (the
// vocabulary everything else uses), then the concepts from "how is the data
// split" to "what runs it", then the levels, then the glossary.
// ---------------------------------------------------------------------------

const LAYER_ORDER = ['physical-disks', 'drive-group', 'span', 'virtual-drive'];

const CONCEPT_ORDER = [
  'segmentation', 'striping', 'chunk', 'algorithm',
  'redundancy', 'mirroring', 'parity',
  'capacity', 'fault-tolerance', 'write-penalty', 'performance',
  'rebuild', 'scrubbing', 'write-hole', 'bbu', 'raid-is-not-a-backup',
  'raid-engine', 'hba', 'backplane', 'why-linux-md',
];

// Which concept opens each transcluding section of a level page (§4 of the spec).
const SECTION_CONCEPT = {
  segmentation: 'segmentation',
  redundancy:   'redundancy',
  algorithm:    'algorithm',
  whereItRuns:  'raid-engine',
};

// The two axes in words. This is a rendering of the engine's own vocabulary
// (model.js SEGMENTATIONS / REDUNDANCIES), not a fact about any level: the
// level says which pair it is, this table says how the pair is spelled.
const SEGMENTATION_WORDS = { striped: 'striped', linear: 'linear' };
const REDUNDANCY_WORDS   = { none: 'no redundancy', mirror: 'mirror', parity1: 'single parity', parity2: 'double parity' };

const SITE   = 'https://raid-sandbox.dev';
const PARITY = ['parity1', 'parity2'];

// ---------------------------------------------------------------------------
// READING THE DATA
// ---------------------------------------------------------------------------

const readYaml = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  try { return yaml.load(text); }
  catch (e) { fail(`${path.relative(ROOT, file)}: ${e.message}`); }
};

const yamlFiles = (dir) =>
  fs.readdirSync(dir).filter((f) => f.endsWith('.yaml') && f !== 'index.yaml').sort();

function loadData() {
  const kbDir = path.join(ROOT, 'data', 'kb');
  const kb = new Map();
  for (const file of yamlFiles(kbDir)) {
    const id  = file.slice(0, -5);
    const doc = readYaml(path.join(kbDir, file));
    const where = `data/kb/${file}`;
    if (doc.id !== id) fail(`${where}: id "${doc.id}" does not match the filename`);
    for (const key of ['kind', 'name', 'short', 'status']) if (!doc[key]) fail(`${where}: ${key} is required`);
    if (!Array.isArray(doc.sources) || !doc.sources.length) fail(`${where}: sources is required and cannot be empty`);
    if (doc.kind === 'concept' && !doc.long) fail(`${where}: a concept needs a long form`);
    kb.set(id, { ...doc, where });
  }

  const levelDir = path.join(ROOT, 'data', 'raid-levels');
  const index = readYaml(path.join(levelDir, 'index.yaml'));
  const levelFiles = {};
  for (const file of yamlFiles(levelDir)) levelFiles[file.slice(0, -5)] = readYaml(path.join(levelDir, file));
  const levels = Levels.createLevels(Levels.assemble(index, levelFiles));

  // Only the levels that carry a `kb:` block get a page; the order is the
  // catalogue's, so the map and the level index can never disagree.
  const pages = levels.order.filter((def) => def.kb)
    .map((def) => ({ ...def, where: `data/raid-levels/${def.id}.yaml` }));

  const algoDir = path.join(ROOT, 'data', 'algorithms');
  const algorithms = yamlFiles(algoDir).map((f) => ({ ...readYaml(path.join(algoDir, f)), where: `data/algorithms/${f}` }));

  const compDir = path.join(ROOT, 'data', 'components');
  const compIndex = readYaml(path.join(compDir, 'index.yaml'));
  const components = compIndex.components.map((entry) => ({
    ...readYaml(path.join(compDir, entry.file)), where: `data/components/${entry.file}`,
  }));

  const intro = readYaml(path.join(ROOT, 'data', 'intro.yaml'));

  return { kb, levels, pages, algorithms, components, intro };
}

/**
 * The WebApplication the pages belong to, copied out of index.html's own
 * JSON-LD rather than restated here: the `isPartOf` and `author` of every
 * generated page are then the same facts the home page already publishes, and
 * they cannot drift (the no-unverifiable-claims rule).
 *
 * The Open Graph / Twitter identity is copied the same way, from index.html's
 * own `<meta property="og:...">` tags: `og:site_name` and the `og:image`
 * quadruple. A generated page has no figure of its own, so the site's one
 * preview image (the same the home page uses) is the only honest choice —
 * copying it, rather than hardcoding it here, is what keeps the two from
 * drifting if the image is ever replaced.
 */
function readSiteIdentity() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) fail('index.html: no JSON-LD block to copy the site identity from');
  let ld;
  try { ld = JSON.parse(m[1]); } catch (e) { fail(`index.html: the JSON-LD block does not parse (${e.message})`); }
  if (!ld.name || !ld.url) fail('index.html: the JSON-LD block has no name/url');

  const ogMeta = (property) => {
    const re = new RegExp(`<meta property="${property}" content="([^"]*)"`);
    const hit = re.exec(html);
    if (!hit || !hit[1]) fail(`index.html: no <meta property="${property}"> to copy into the knowledge base pages`);
    return hit[1];
  };
  const og = {
    siteName:    ogMeta('og:site_name'),
    image:       ogMeta('og:image'),
    imageWidth:  ogMeta('og:image:width'),
    imageHeight: ogMeta('og:image:height'),
    imageAlt:    ogMeta('og:image:alt'),
  };

  return { app: { '@type': ld['@type'] || 'WebApplication', name: ld.name, url: ld.url },
           author: ld.author || null, publisher: ld.publisher || null, og };
}

// ---------------------------------------------------------------------------
// TEXT HELPERS
// ---------------------------------------------------------------------------

// A folded YAML scalar arrives with its newlines already turned into spaces and
// a trailing one; `short` is plain text and is never rendered as markdown.
const plain = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const shortOf = (entry) => plain(entry.kind ? entry.short : entry.kb.short);

// A cheap guard against the one abbreviation the sentence-boundary regex
// below would otherwise misread as a sentence end (a period, a space, a
// capital letter): "e.g. Something" reads exactly like two sentences to that
// rule. A short, known list is enough — the alternative (a real abbreviation
// dictionary) is not worth it for a handful of knowledge-base authors.
const ABBREVIATIONS = ['e.g', 'i.e', 'etc', 'vs', 'cf'];
const endsWithAbbreviation = (textBeforePunctuation) => {
  const lower = textBeforePunctuation.toLowerCase();
  return ABBREVIATIONS.some((abbr) => lower.endsWith(abbr));
};

/**
 * A meta description: whole sentences from the start of `short`, kept while
 * the result stays within `limit` characters (search engines truncate a
 * `<meta name="description">` around 160) — never a mid-sentence cut, and
 * never empty: the first sentence is kept even if it alone runs past the
 * limit, because search engines truncating on their own reads better than a
 * cut we chose ourselves. A sentence ends at ". ", "! " or "? " followed by a
 * capital letter — cheap enough that a data file never has to spell one out.
 */
function metaDescription(text, limit = 160) {
  const s = plain(text);
  const boundary = /[.!?] (?=[A-Z])/g;
  // Every sentence but the last ends right before a capital letter that
  // starts the next one, which is what `boundary` finds; the last sentence's
  // end has nothing after it to match on, so it is added explicitly — without
  // it, a two-sentence `short` could never keep its second sentence at all.
  const cuts = [];
  let m;
  while ((m = boundary.exec(s))) {
    if (endsWithAbbreviation(s.slice(0, m.index))) continue;
    cuts.push(m.index + 1);   // include the punctuation, drop the space after it
  }
  cuts.push(s.length);

  let end = cuts[0];           // the first sentence is kept regardless of length
  for (let i = 1; i < cuts.length && cuts[i] <= limit; i++) end = cuts[i];
  return s.slice(0, end);
}

const classWords = (shape) => {
  const seg = SEGMENTATION_WORDS[shape.segmentation];
  const red = REDUNDANCY_WORDS[shape.redundancy];
  if (!seg || !red) fail(`no words for the shape ${shape.segmentation} + ${shape.redundancy}`);
  return `${seg} + ${red}`;
};

/** Fill {name} placeholders, and refuse to emit a template with a hole left. */
function fill(template, values, where) {
  const out = String(template).replace(/\{(\w+)\}/g, (m, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key))
      fail(`${where}: the text uses {${key}}, which nothing here defines`);
    return String(values[key]);
  });
  if (/\{\w+\}/.test(out)) fail(`${where}: a placeholder survived`);
  return out;
}

// ---------------------------------------------------------------------------
// THE EXAMPLE — every number and every grid on a level page comes from here.
// The tree is built exactly as the sandbox would build it: `disks` disks of
// `sizeGB`, one array of the level's own shape, the example's algorithm. If the
// catalogue does not name the result that level, the example is wrong and the
// build stops — a page must not explain RAID 5 with a tree that is a RAID 1.
// ---------------------------------------------------------------------------

function exampleTree(def, levels) {
  const ex = def.kb.example;
  if (!ex || typeof ex !== 'object') fail(`${def.where}: kb.example is required`);
  for (const key of ['disks', 'sizeGB']) if (typeof ex[key] !== 'number') fail(`${def.where}: kb.example.${key} must be a number`);
  if (def.shape.members !== 'disks') fail(`${def.where}: a page example is defined for leaf levels only`);

  const disks = Array.from({ length: ex.disks }, (_, i) =>
    Model.disk(`disk-${i + 1}`, ex.sizeGB, ex.protocol || 'SATA'));
  const node = Model.array(def.shape.segmentation, def.shape.redundancy, disks, ex.algorithm ?? null, 'array-1');
  if (def.shape.copies) node.copies = def.shape.copies;

  const named = levels.match(node);
  if (!named || named.id !== def.id)
    fail(`${def.where}: kb.example builds ${named ? named.id : 'a shape with no name'}, not ${def.id}`);
  return node;
}

/** The build document behind the "try it" link: the example, nothing else. */
function exampleLink(def, node) {
  const doc = {
    v: BuildDoc.VERSION,
    disks: node.members.map((d) => ({ id: d.id, sizeGB: d.sizeGB, protocol: d.protocol })),
    arrays: [{ id: node.id, segmentation: node.segmentation, redundancy: node.redundancy,
               algorithm: node.algorithm ?? null, members: node.members.map((d) => d.id) }],
    components: [], wires: [],
  };
  try { return `../index.html#build=${BuildDoc.encode(doc)}`; }
  catch (e) { fail(`${def.where}: the example does not encode as a build document (${e.message})`); }
}

// ---------------------------------------------------------------------------
// THE GRID — layout.js's placement, drawn as a text table. Same notation as the
// golden tables the suite asserts against (tests/layout-golden.test.js): one row
// per stripe, one column per disk, D<n> a data segment, P and Q the parity
// blocks, D<n>' the mirror copy of segment n.
// ---------------------------------------------------------------------------

function gridText(def, node) {
  const placement = Layout.computePlacement(node, {});
  if (placement.unsupported) return { text: null, reason: placement.reason, algorithm: null };
  if (placement.fallback) fail(`${def.where}: kb.example.algorithm — ${placement.fallback}`);

  const cell = (c) => {
    if (!c) return '·';
    if (c.role === 'data')   return `D${c.seg}`;
    if (c.role === 'mirror') return `D${c.seg}'`;
    if (c.role === 'P' || c.role === 'Q') return c.role;
    fail(`${def.where}: the placement has a cell with no known role ("${c.role}")`);
  };

  const head = Array.from({ length: placement.columns }, (_, d) => `disk ${d}`);
  const rows = placement.stripes.map((row, s) => ({ label: `stripe ${s}`, cells: row.map(cell) }));
  const labelWidth = Math.max(...rows.map((r) => r.label.length));
  const widths = head.map((h, d) => Math.max(h.length, ...rows.map((r) => (r.cells[d] || '').length)));

  const line = (label, cells) =>
    label.padEnd(labelWidth) + cells.map((c, d) => '  ' + String(c).padStart(widths[d])).join('');

  return {
    text: [line('', head), ...rows.map((r) => line(r.label, r.cells))].join('\n'),
    reason: null,
    algorithm: placement.algorithm,
  };
}

// ---------------------------------------------------------------------------
// THE WORKED CALCULATION — the words are the level's `kb.worked`, the numbers
// are the engine's. Nothing here reads `reference.*`: those are the same numbers
// written by a human, and kb-worked.test.js is where the two are compared.
// ---------------------------------------------------------------------------

const WORKED_KEYS = ['capacity', 'faultTolerance', 'writePenalty'];

function workedText(def, node) {
  const worked = def.kb.worked;
  if (!worked || typeof worked !== 'object') fail(`${def.where}: kb.worked is required`);
  for (const key of WORKED_KEYS) if (!worked[key]) fail(`${def.where}: kb.worked.${key} is required`);

  const perf = Model.performance(node);
  const values = {
    N:                      Model.countDisks(node),
    size:                   node.members[0].sizeGB,
    capacity:               Model.capacityGB(node),
    faultTolerance:         Model.faultTolerance(node),
    writePenaltyRandom:     perf.writePenalty,
    writePenaltySequential: perf.writePenaltySequential,
  };

  return WORKED_KEYS.map((key) =>
    fill(String(worked[key]).replace(/\n+$/, ''), values, `${def.where}: kb.worked.${key}`)).join('\n\n');
}

// ---------------------------------------------------------------------------
// THE ALGORITHMS a level's class accepts. The rule is the data's: an algorithm
// file `appliesTo` a set of redundancies, and a level whose `defaultAlgorithm`
// is null has no algorithm axis at all and says so in `noAlgorithmReason`.
// That is the same division the sandbox's algorithm slot makes (canvas-controller
// `_axisOptions`: parity and flat mirror have the axis, nothing else does); the
// sandbox's copy could not be reused because it lives inside a DOM controller,
// so the rule is restated here from the files rather than from that code.
// The RAID 10 layouts are `raid10-near` as files and `near` on an array —
// layout.js strips the prefix, and so does this.
// ---------------------------------------------------------------------------

const algoKey = (id) => String(id).replace(/^raid10-/, '');

function algorithmsFor(def, algorithms) {
  if (!def.defaultAlgorithm) return [];
  const hits = algorithms.filter((a) => (a.appliesTo || []).includes(def.shape.redundancy));
  if (!hits.length) fail(`${def.where}: defaultAlgorithm "${def.defaultAlgorithm}" but no algorithm file applies to ${def.shape.redundancy}`);
  const isDefault = (a) => algoKey(a.id) === algoKey(def.defaultAlgorithm);
  if (!hits.some(isDefault)) fail(`${def.where}: defaultAlgorithm "${def.defaultAlgorithm}" names no algorithm file`);
  return hits.map((a) => ({ ...a, isDefault: isDefault(a) }));
}

// ---------------------------------------------------------------------------
// WHERE IT RUNS — read off the component files. Three facts, each one a
// component's own sentence: which objects can be the RAID engine, which engine
// owns a layout the level's algorithms ask for, and what an engine with no
// protected cache has to say about parity.
// ---------------------------------------------------------------------------

const provides = (c, cap) => (c.provides || []).includes(cap);
const LAYOUT_CAP = 'layout:';

function whereItRuns(def, components, algorithms) {
  const engines = components.filter((c) => provides(c, 'raid-engine'));
  if (!engines.length) fail('data/components: no component provides raid-engine');

  // One line per owning engine, its layouts joined: the validator fills this
  // sentence for one algorithm at a time, a page states the restriction once.
  const byOwner = new Map();
  for (const algo of algorithmsFor(def, algorithms)) {
    const cap = LAYOUT_CAP + algoKey(algo.id);
    const owner = engines.find((c) => provides(c, cap));
    if (!owner) continue;
    if (!owner.layouts || !owner.layouts.reason) fail(`${owner.where}: provides ${cap} but has no layouts.reason`);
    // {raidType} is the build's own verdict when the validator fills this
    // sentence; a page has no build, so it is filled with the verdicts on which
    // the layout is NOT available — every engine that does not provide it,
    // minus the owner's own verdict, on which it is (with the right engine).
    const ownerType = owner.verdict && owner.verdict.raidType;
    const without = engines.filter((c) => !provides(c, cap) && c.verdict && c.verdict.raidType !== ownerType);
    const types = [...new Set(without.map((c) => c.verdict.raidType))].sort();
    if (!types.length) fail(`${owner.where}: ${cap} is offered by every engine — the restriction has no other side`);
    if (!byOwner.has(owner.id)) byOwner.set(owner.id, { owner, algorithms: [], types });
    byOwner.get(owner.id).algorithms.push(algoKey(algo.id));
  }
  const restricted = [...byOwner.values()].map(({ owner, algorithms: names, types }) => ({
    owner,
    reason: fill(plain(owner.layouts.reason),
                 { label: def.name, algorithm: names.join(' / '), raidType: joinOr(types) },
                 `${owner.where}: layouts.reason`),
  }));

  const writeHoles = !PARITY.includes(def.shape.redundancy) ? [] :
    engines.filter((c) => !provides(c, 'power-loss-protection'))
      .map((c) => {
        if (!c.writeHole || !c.writeHole.reason) fail(`${c.where}: no power-loss-protection and no writeHole.reason`);
        if (!c.verdict || !c.verdict.raidType) fail(`${c.where}: writeHole.reason needs a verdict.raidType to fill {raidType}`);
        return { component: c, reason: fill(plain(c.writeHole.reason), { raidType: c.verdict.raidType }, `${c.where}: writeHole.reason`) };
      });

  return { engines, restricted, writeHoles };
}

const joinOr = (xs) => xs.length < 2 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;

// ---------------------------------------------------------------------------
// CROSS-REFERENCES — [[id]] in the prose, `related` and `confusedWith` in the
// data. A concept lives on the concepts page at its own anchor; a level lives on
// its own page. An id that is neither is a broken reference and stops the build.
// The lookup is case-insensitive because the prose capitalises a reference that
// opens a sentence ([[Redundancy]]). The link TEXT is the reference as the author
// typed it, hyphens read as spaces — "chunk", "write penalty", "Redundancy" — so
// a link sits in its sentence; [[id|text]] says it another way. The entry's own
// `name` is used only where the link stands alone (related lists, the map).
// ---------------------------------------------------------------------------

function target(id, ctx) {
  const entry = ctx.kb.get(id) || ctx.kb.get(String(id).toLowerCase());
  if (entry) return { href: `${entry.id}.html`, name: entry.name };
  const level = ctx.pageById.get(id) || ctx.pageById.get(String(id).toLowerCase());
  if (level) return { href: `${level.id}.html`, name: level.name };
  return null;
}

function makeResolver(ctx, where) {
  return (id, text) => {
    const hit = target(id, ctx);
    if (!hit) fail(`${where}: [[${id}]] names no knowledge-base entry and no level page`);
    return `<a href="${hit.href}">${escapeHtml(text || String(id).replace(/-/g, ' '))}</a>`;
  };
}

const link = (hit) => `<a href="${hit.href}">${escapeHtml(hit.name)}</a>`;

/** A concept's short form, inline, with the way to its long form. */
function transclude(id, ctx, where) {
  const entry = ctx.kb.get(id);
  if (!entry) fail(`${where}: the section transcludes "${id}", which data/kb has no file for`);
  return [
    `<p class="kb-short">${escapeHtml(shortOf(entry))}</p>`,
    `<p class="kb-more"><a href="${entry.id}.html">Read more — ${escapeHtml(entry.name)}</a></p>`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// PAGE CHROME — one shape for every page. No <script>: these are documents, and
// the knowledge base is the mobile front door of ADR-003, so nothing on them
// needs to run for them to be read.
// ---------------------------------------------------------------------------

const NAV = [
  { file: 'index.html',    label: 'Map' },
  { file: 'glossary.html', label: 'Glossary' },
];

/**
 * The map again, as a column beside the text: the same three groups in the
 * same order, the current page marked. It is what a wide screen gets instead of
 * a wider line of prose — the reading column keeps its measure, the width goes
 * to the structure. The map page itself has no side column: it IS the map.
 */
function sideNav(ctx, file) {
  const item = (href, name) => href === file
    ? `          <li><span class="kb-side-item active" aria-current="page">${escapeHtml(name)}</span></li>`
    : `          <li><a class="kb-side-item" href="${href}">${escapeHtml(name)}</a></li>`;
  const kbHrefs = (ids) => ids.map((id) => {
    const e = ctx.kb.get(id);
    if (!e) fail(`generate-kb.js: the side nav lists "${id}", which data/kb has no file for`);
    return [`${e.id}.html`, e.name];
  });
  // A group is a native <details>: no script, and the keyboard works. The one
  // that holds the current page opens; the others fold to their title.
  const group = (title, entries) => {
    const open = entries.some(([href]) => href === file);
    return [
      `      <details class="kb-side-group"${open ? ' open' : ''}>`,
      `        <summary class="kb-side-title">${title}</summary>`,
      '        <ul class="kb-side-list">',
      entries.map(([href, name]) => item(href, name)).join('\n'),
      '        </ul>',
      '      </details>',
    ].join('\n');
  };
  return [
    '    <aside class="kb-side" aria-label="Knowledge base map">',
    '      <p class="kb-side-home"><a href="index.html">Map</a> · <a href="glossary.html">Glossary</a></p>',
    group('Storage layers', kbHrefs(LAYER_ORDER)),
    group('RAID levels', ctx.pages.map((p) => [`${p.id}.html`, p.name])),
    group('Concepts', kbHrefs(CONCEPT_ORDER)),
    '    </aside>',
  ].join('\n');
}

/** The page's own sections, as a column on the right: "on this page". */
function pageToc(toc) {
  if (!toc || !toc.length) return '';
  return [
    '    <aside class="kb-toc" aria-label="On this page">',
    '      <p class="kb-toc-title">On this page</p>',
    '      <ul class="kb-toc-list">',
    toc.map((t) => `        <li><a href="#${t.id}">${escapeHtml(t.title)}</a></li>`).join('\n'),
    '      </ul>',
    '    </aside>',
  ].join('\n');
}

// kb/index.html is the map: the sitemap and the home page both link to it as
// the directory `kb/`, not the file, so its canonical, og:url and JSON-LD url
// have to say the same thing rather than a URL nothing else ever points at.
// Every other page is a file of its own — the directory form makes no sense
// for it.
const pageUrl = (file) => file === 'index.html' ? `${SITE}/kb/` : `${SITE}/kb/${file}`;

// `description` (capped at a sentence boundary, metaDescription()) feeds the
// meta tag and og:description, both of which real crawlers truncate anyway.
// `fullDescription` feeds the JSON-LD `description`, which is not a snippet
// shown in a results list but the page's own first lines restated — cutting
// it the same way would just be losing text nothing forced us to lose.
function chrome({ file, title, description, fullDescription = description, heading, subtitle, body, ctx, side = true, toc = null, kind = 'page' }) {
  const nav = NAV.map((n) => n.file === file
    ? `      <span class="kb-nav-item active" aria-current="page">${n.label}</span>`
    : `      <a class="kb-nav-item" href="${n.file}">${n.label}</a>`)
    .concat([`      <a class="kb-nav-item" href="../index.html">Sandbox</a>`]).join('\n');

  const url = pageUrl(file);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: heading,
    description: fullDescription,
    inLanguage: 'en',
    url,
    isPartOf: { '@type': ctx.site.app['@type'], name: ctx.site.app.name, url: ctx.site.app.url },
  };
  if (ctx.site.author) ld.author = ctx.site.author;
  if (ctx.site.publisher) ld.publisher = ctx.site.publisher;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${url}">
  <meta name="theme-color" content="#0a0e14">

  <!-- Social preview. og:url/og:title/og:description mirror what this page
       already declares above; og:image is the site's own preview image
       (copied from index.html — see readSiteIdentity), since a knowledge-base
       page has no figure of its own to offer instead. -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${escapeHtml(ctx.site.og.siteName)}">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(ctx.site.og.image)}">
  <meta property="og:image:width" content="${escapeHtml(ctx.site.og.imageWidth)}">
  <meta property="og:image:height" content="${escapeHtml(ctx.site.og.imageHeight)}">
  <meta property="og:image:alt" content="${escapeHtml(ctx.site.og.imageAlt)}">
  <meta name="twitter:card" content="summary_large_image">

  <link rel="icon" href="../favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="../apple-touch-icon.png">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../styles/styles.css">
  <link rel="stylesheet" href="../styles/kb.css">

  <!-- Only what this page verifiably contains: its own heading, its own first
       lines, and the application it belongs to — copied from index.html's
       JSON-LD, not restated. No dates, no ratings, nothing invented. -->
  <script type="application/ld+json">
${JSON.stringify(ld, null, 2).split('\n').map((l) => '  ' + l).join('\n')}
  </script>
</head>
<body class="kb-body kb-body--${kind}">

<div class="kb-page${side ? ' kb-page--side' : ''}${toc && toc.length ? ' kb-page--toc' : ''}">
${side ? `\n${sideNav(ctx, file)}\n` : ''}
  <div class="kb-main">

  <header class="kb-header">
    <h1 class="kb-title">${escapeHtml(heading)}</h1>
${subtitle ? `    <p class="kb-subtitle">${subtitle}</p>\n` : ''}  </header>

  <nav class="kb-nav" role="navigation" aria-label="Knowledge base">
${nav}
  </nav>

${body}

  <footer class="kb-footer">
    <a href="../index.html">RAID Sandbox</a> · <a href="index.html">Knowledge base</a> · <a href="mailto:valentina.malavenda01@gmail.com">Valentina Malavenda</a>
  </footer>

  </div>
${toc && toc.length ? `\n${pageToc(toc)}\n` : ''}
</div>

</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// THE LEVEL PAGE — the fixed schema of spec §4, in that order every time.
// ---------------------------------------------------------------------------

function levelPage(def, ctx) {
  const where = def.where;
  const node  = exampleTree(def, ctx.levels);
  const grid  = gridText(def, node);
  const runs  = whereItRuns(def, ctx.components, ctx.algorithms);
  const algos = algorithmsFor(def, ctx.algorithms);
  const md    = (text, w) => render(text, { resolveLink: makeResolver(ctx, w), where: w, headingId: slug });
  const out   = [];
  const toc   = headingsOf(def.kb.long);

  const section = (id, title, ...parts) => {
    toc.push({ id, title });
    out.push(`  <section class="kb-section" id="${id}">`);
    out.push(`    <h2>${title}</h2>`);
    for (const part of parts.filter(Boolean)) out.push(indent(part, 4));
    out.push('  </section>');
  };

  // 1 — the level's own story, under its class in words and its short form.
  // No id on the section itself: kb.long always opens with "## What it is",
  // whose rendered heading already gets that id (headingId: slug below) —
  // giving the wrapper the same id would duplicate it (invalid HTML) and make
  // the anchor resolve to the section instead of the heading it names.
  out.push('  <section class="kb-section">');
  out.push(`    <p class="kb-lede">${escapeHtml(shortOf(def))}</p>`);
  if (def.kb.long) out.push(indent(md(def.kb.long, `${where}: kb.long`), 4));
  out.push('  </section>');

  // 2 — segmentation, then this level's own grid
  section('segmentation', 'Segmentation',
    transclude(SECTION_CONCEPT.segmentation, ctx, where),
    grid.text
      ? `<p class="kb-caption">${escapeHtml(def.name)} · ${escapeHtml(String(def.kb.example.disks))} disks${grid.algorithm ? ` · ${escapeHtml(grid.algorithm)}` : ''}</p>\n<pre class="kb-grid"><code>${escapeHtml(grid.text)}</code></pre>`
      : `<p class="kb-caption">No placement grid: ${escapeHtml(grid.reason)}</p>`);

  // 3 — redundancy, then the worked calculation
  section('redundancy', 'Redundancy',
    transclude(SECTION_CONCEPT.redundancy, ctx, where),
    `<pre class="kb-worked"><code>${escapeHtml(workedText(def, node))}</code></pre>`);

  // 4 — the algorithm axis, or the reason this class has none
  section('algorithm', 'Algorithm',
    transclude(SECTION_CONCEPT.algorithm, ctx, where),
    algos.length
      ? '<dl class="kb-defs">\n' + algos.map((a) =>
          `  <dt>${escapeHtml(a.name)}${a.isDefault ? ' <span class="kb-tag">default</span>' : ''}</dt>\n` +
          `  <dd>${escapeHtml(plain(a.description))}</dd>`).join('\n') + '\n</dl>'
      : `<p>${escapeHtml(plain(noAlgorithmReason(def)))}</p>`);

  // 5 — the objects that can run it, and what they have to say about it
  section('where-it-runs', 'Where it runs',
    transclude(SECTION_CONCEPT.whereItRuns, ctx, where),
    '<dl class="kb-defs">\n' + runs.engines.map((c) =>
      `  <dt>${escapeHtml(c.name)}</dt>\n  <dd>${escapeHtml(plain(c.description))}</dd>`).join('\n') + '\n</dl>',
    runs.restricted.length
      ? '<ul class="kb-notes">\n' + runs.restricted.map((r) =>
          `  <li>${escapeHtml(r.reason)}</li>`).join('\n') + '\n</ul>' : null,
    runs.writeHoles.length
      ? '<h3>The write hole</h3>\n<dl class="kb-defs">\n' + runs.writeHoles.map((w) =>
          `  <dt>${escapeHtml(w.component.name)}</dt>\n  <dd>${escapeHtml(w.reason)}</dd>`).join('\n') + '\n</dl>' : null);

  // 6 — the widths below the level, and what they run as
  const below = belowTheMinimum(def, ctx);
  if (below) section('below-the-minimum', 'Below the minimum', below);

  // 7 — the prose fields that were already in the level files
  const practice = inPractice(def);
  if (practice) section('in-practice', 'In practice', practice);

  // 8 — the example, opened in the sandbox
  section('try-it', 'Try it',
    `<p><a class="kb-try" href="${exampleLink(def, node)}">Open this example in the sandbox</a></p>`,
    `<p class="kb-caption">A desktop link: below the desktop breakpoint the sandbox is not offered (ADR-003).</p>`);

  // 9 — related concepts, and the levels this one is confused with
  section('see-also', 'See also', seeAlso(def, ctx));

  const full = shortOf(def);
  return chrome({
    file: `${def.id}.html`,
    title: `${def.name} — RAID Sandbox knowledge base`,
    description: metaDescription(full),
    fullDescription: full,
    heading: def.name,
    subtitle: escapeHtml(classWords(def.shape)),
    body: out.join('\n'),
    ctx,
    toc,
    kind: 'level',
  });
}

function noAlgorithmReason(def) {
  if (!def.noAlgorithmReason) fail(`${def.where}: no defaultAlgorithm and no noAlgorithmReason to explain it`);
  return def.noAlgorithmReason;
}

function belowTheMinimum(def, ctx) {
  const rows = [];
  rows.push(`  <dt>Minimum for the level</dt>\n  <dd>${def.minDisks} disks</dd>`);
  if (def.minDisksToRun !== undefined) {
    if (!def.minDisksToRunSource) fail(`${def.where}: minDisksToRun without a minDisksToRunSource`);
    rows.push(`  <dt>The real system still starts it at</dt>\n  <dd>${def.minDisksToRun} disks<br>` +
              `<span class="kb-source">${escapeHtml(plain(def.minDisksToRunSource))}</span></dd>`);
  }
  for (const c of def.collapsesTo || []) {
    rows.push(`  <dt>With ${c.disks} disks it is ${escapeHtml(classWords(c.becomes))}</dt>\n` +
              `  <dd>${escapeHtml(plain(c.because))}<br>` +
              `<span class="kb-source">${escapeHtml(plain(c.source))}</span></dd>`);
  }
  return rows.length ? `<dl class="kb-defs">\n${rows.join('\n')}\n</dl>` : null;
}

const PRACTICE_FIELDS = [
  ['pros', 'Good at'], ['cons', 'Costs'], ['useCases', 'Used for'], ['notFor', 'Not for'],
];

function inPractice(def) {
  const parts = [];
  for (const [field, label] of PRACTICE_FIELDS) {
    const items = def[field];
    if (!Array.isArray(items) || !items.length) continue;
    // A list item with a ": " in it is a mapping to YAML, not a sentence; it
    // would print as [object Object]. The file has to quote it.
    for (const x of items) if (typeof x !== 'string')
      fail(`${def.where}: ${field} has an item that is not text (quote it in the YAML): ${JSON.stringify(x)}`);
    parts.push(`<h3>${label}</h3>\n<ul>\n` +
      items.map((x) => `  <li>${escapeHtml(plain(x))}</li>`).join('\n') + '\n</ul>');
  }
  if (def.note) parts.push(`<p class="kb-note">${escapeHtml(plain(def.note))}</p>`);
  return parts.length ? parts.join('\n') : null;
}

function seeAlso(def, ctx) {
  const parts = [];
  const related = (def.kb.related || []).map((id) => {
    const hit = target(id, ctx);
    if (!hit) fail(`${def.where}: kb.related names "${id}", which has no page`);
    return `  <li>${link(hit)}</li>`;
  });
  if (related.length) parts.push(`<h3>Related</h3>\n<ul class="kb-links">\n${related.join('\n')}\n</ul>`);

  const confused = (def.kb.confusedWith || []).map((id) => {
    const page = ctx.pageById.get(id);
    if (page) return `  <li>${link({ href: `${page.id}.html`, name: page.name })}</li>`;
    const level = ctx.levels.get(id);
    if (!level) fail(`${def.where}: kb.confusedWith names "${id}", which is no level`);
    return `  <li>${escapeHtml(level.name)}</li>`;   // no page yet — the name, not a dead link
  });
  if (confused.length) parts.push(`<h3>Often confused with</h3>\n<ul class="kb-links">\n${confused.join('\n')}\n</ul>`);
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// THE MAP, THE CONCEPTS PAGE, THE GLOSSARY
// ---------------------------------------------------------------------------

function entryCard(hit, short) {
  return `    <li>\n      <h3>${link(hit)}</h3>\n      <p>${escapeHtml(short)}</p>\n    </li>`;
}

function mapPage(ctx) {
  const out = [];
  const summary = plain(ctx.intro.summary);
  if (!summary) fail('data/intro.yaml: summary is required for the map');
  out.push(`  <section class="kb-section" id="intro">\n    <p class="kb-lede">${escapeHtml(summary)}</p>\n  </section>`);

  const group = (id, title, ids, lookup) => {
    out.push(`  <section class="kb-section" id="${id}">`);
    out.push(`    <h2>${title}</h2>`);
    out.push('    <ul class="kb-cards">');
    for (const key of ids) out.push(lookup(key));
    out.push('    </ul>');
    out.push('  </section>');
  };

  const kbCard = (id) => {
    const entry = ctx.kb.get(id);
    if (!entry) fail(`generate-kb.js: the map lists "${id}", which data/kb has no file for`);
    return entryCard({ href: `${entry.id}.html`, name: entry.name }, shortOf(entry));
  };

  group('layers',   'Storage layers', LAYER_ORDER, kbCard);
  group('levels',   'RAID levels',    ctx.pages.map((p) => p.id),
    (id) => { const p = ctx.pageById.get(id); return entryCard({ href: `${p.id}.html`, name: p.name }, shortOf(p)); });
  group('concepts', 'Concepts',       CONCEPT_ORDER, kbCard);

  out.push('  <section class="kb-section" id="glossary-link">');
  out.push('    <h2>Glossary</h2>');
  out.push('    <p><a href="glossary.html">Every term and level, one line each</a></p>');
  out.push('  </section>');

  return chrome({
    file: 'index.html',
    title: 'RAID knowledge base — the map',
    description: metaDescription(summary),
    fullDescription: summary,
    heading: 'RAID knowledge base',
    subtitle: 'Map',
    body: out.join('\n'),
    ctx,
    side: false,
  });
}

// One page per concept: the title stays in view, the side column marks the
// page, and the right column lists the page's own sections — so a reader who
// comes back after a pause knows where they are without scrolling to find out.
function conceptPage(entry, ctx) {
  const where = `${entry.where}: long`;
  const out = [];
  out.push('  <section class="kb-section kb-concept" id="what-it-is">');
  if (entry.status === 'to-verify')
    out.push('    <p class="kb-flag">Not yet checked against a primary source</p>');
  out.push(`    <p class="kb-lede">${escapeHtml(shortOf(entry))}</p>`);
  out.push(indent(render(entry.long, { resolveLink: makeResolver(ctx, where), where, headingId: slug }), 4));
  out.push('  </section>');

  const toc = headingsOf(entry.long);
  out.push('  <section class="kb-section" id="sources">');
  out.push('    <h2>Sources</h2>');
  out.push('    <ul class="kb-sources">');
  // A source is plain text, or { ref, url, note }: `ref` names the thing itself
  // (the man page, the paper, the kernel file) and is the link; `note` is what
  // was taken from it and stays plain, so the link is light and the reader can
  // still check.
  for (const s of entry.sources) {
    if (typeof s === 'string') { out.push(`      <li>${escapeHtml(plain(s))}</li>`); continue; }
    if (!s || !s.ref || !s.url) fail(`${entry.where}: a source needs ref and url (or a plain string)`);
    out.push(`      <li><a href="${escapeHtml(s.url)}">${escapeHtml(plain(s.ref))}</a>${s.note ? ` — ${escapeHtml(plain(s.note))}` : ''}</li>`);
  }
  out.push('    </ul>');
  out.push('  </section>');
  toc.push({ id: 'sources', title: 'Sources' });

  const related = (entry.related || []).map((rid) => {
    const hit = target(rid, ctx);
    if (!hit) fail(`${entry.where}: related names "${rid}", which has no page`);
    return `      <li>${link(hit)}</li>`;
  });
  if (related.length) {
    out.push('  <section class="kb-section" id="related">');
    out.push('    <h2>Related</h2>');
    out.push(`    <ul class="kb-links">\n${related.join('\n')}\n    </ul>`);
    out.push('  </section>');
    toc.push({ id: 'related', title: 'Related' });
  }

  return chrome({
    file: `${entry.id}.html`,
    title: `${entry.name} — RAID Sandbox knowledge base`,
    description: metaDescription(shortOf(entry)),
    fullDescription: shortOf(entry),
    heading: entry.name,
    subtitle: entry.kind === 'concept' ? 'Concept' : 'Term',
    body: out.join('\n'),
    ctx,
    toc,
    kind: 'concept',
  });
}

function glossaryPage(ctx) {
  const rows = [
    ...[...ctx.kb.values()].map((e) => ({ name: e.name, short: shortOf(e), href: `${e.id}.html` })),
    ...ctx.pages.map((p) => ({ name: p.name, short: shortOf(p), href: `${p.id}.html` })),
  ].sort((a, b) => {
    const x = a.name.toLowerCase(), y = b.name.toLowerCase();
    return x < y ? -1 : x > y ? 1 : (a.href < b.href ? -1 : 1);
  });

  const body = ['  <section class="kb-section" id="glossary">', '    <dl class="kb-defs">']
    .concat(rows.flatMap((r) => [
      `      <dt><a href="${r.href}">${escapeHtml(r.name)}</a></dt>`,
      `      <dd>${escapeHtml(r.short)}</dd>`,
    ]))
    .concat(['    </dl>', '  </section>']).join('\n');

  return chrome({
    file: 'glossary.html',
    title: 'Glossary — RAID Sandbox knowledge base',
    description: 'Every concept, term and RAID level of the knowledge base, one short line each.',
    heading: 'Glossary',
    subtitle: 'Every entry, one line each',
    body,
    ctx,
  });
}

/**
 * Indent a block of HTML for readability — except inside a <pre>, where every
 * space is content. The grids and the text figures are aligned by hand-counted
 * columns; shifting their continuation lines would silently break the drawing.
 */
function indent(text, n) {
  const pad = ' '.repeat(n);
  let inPre = false;
  return String(text).split('\n').map((line) => {
    const out = inPre || !line ? line : pad + line;
    const opens = (line.match(/<pre\b/g) || []).length;
    const closes = (line.match(/<\/pre>/g) || []).length;
    if (opens > closes) inPre = true;
    else if (closes > opens) inPre = false;
    return out;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// SITEMAP — built from the same list of pages this run produced, so a page
// added later cannot be forgotten the way a hand-maintained file can.
// ---------------------------------------------------------------------------

/**
 * sitemap.xml: the home page, the map (as the directory `kb/` — its own
 * canonical, see `pageUrl`), then every other generated page in the order
 * `generate()` produced it. A bare loc, nothing else: no last-modified date,
 * change frequency or priority. Google ignores the last two, and the only
 * last-modified date this script could name — the git commit date of
 * whichever source file built a page — lags one commit behind under the
 * pre-commit hook (the commit that changes the source is not yet made when
 * this runs) and is unavailable in a shallow CI clone; a wrong date is worse
 * than none.
 */
function buildSitemap(pageNames) {
  const urls = [
    `${SITE}/`,
    `${SITE}/kb/`,
    ...pageNames.filter((name) => name !== 'index.html').map((name) => `${SITE}/kb/${name}`),
  ];
  const body = urls.map((u) => `  <url>\n    <loc>${u}</loc>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by .development/scripts/generate-kb.js from the list of pages it
     writes — do not edit by hand, run the generator instead. Each entry is a
     bare loc, nothing else: no last-modified date, change frequency or
     priority. The only last-modified date this script could name is the git
     commit date of whichever source file built a page, which is unavailable
     in a shallow CI clone and lags one commit behind under the pre-commit
     hook, so a wrong date is worse than none; change frequency and priority
     are dropped for the same reason Google gives for ignoring them — they
     carry no information a crawler trusts. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function generate(outDir) {
  const data = loadData();
  const ctx = {
    ...data,
    pageById: new Map(data.pages.map((p) => [p.id, p])),
    site: readSiteIdentity(),
  };

  const files = new Map();
  files.set('index.html', mapPage(ctx));
  files.set('glossary.html', glossaryPage(ctx));
  for (const id of [...LAYER_ORDER, ...CONCEPT_ORDER]) {
    const entry = ctx.kb.get(id);
    if (!entry) fail(`generate-kb.js: the order lists "${id}", which data/kb has no file for`);
    if (!entry.long) continue;
    if (ctx.pageById.has(id)) fail(`generate-kb.js: "${id}" is both a concept and a level — the pages would collide`);
    files.set(`${entry.id}.html`, conceptPage(entry, ctx));
  }
  for (const def of ctx.pages) files.set(`${def.id}.html`, levelPage(def, ctx));

  fs.mkdirSync(outDir, { recursive: true });
  // Remove pages this run does not produce: a level whose `kb:` block is taken
  // away must not leave a page behind that nothing generates any more.
  for (const existing of fs.readdirSync(outDir)) {
    if (existing.endsWith('.html') && !files.has(existing)) fs.unlinkSync(path.join(outDir, existing));
  }
  for (const [name, html] of files) fs.writeFileSync(path.join(outDir, name), html, 'utf8');
  return [...files.keys()];
}

function main(argv) {
  const outFlag = argv.indexOf('--out');
  const outDir = outFlag >= 0 ? path.resolve(argv[outFlag + 1]) : path.join(ROOT, 'kb');
  // --sitemap exists so the test suite can redirect this file the same way
  // --out redirects the pages: sitemap.xml lives at the repo root regardless
  // of --out, because it is a top-level site file, not part of kb/'s output.
  const sitemapFlag = argv.indexOf('--sitemap');
  const sitemapPath = sitemapFlag >= 0 ? path.resolve(argv[sitemapFlag + 1]) : path.join(ROOT, 'sitemap.xml');

  const written = generate(outDir);
  fs.writeFileSync(sitemapPath, buildSitemap(written), 'utf8');
  console.log(`generate-kb: ${written.length} pages in ${path.relative(ROOT, outDir) || '.'}, sitemap at ${path.relative(ROOT, sitemapPath) || '.'}`);
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error(`generate-kb: ${e.message}`); process.exit(1); }
}

module.exports = { generate, buildSitemap, metaDescription, LAYER_ORDER, CONCEPT_ORDER };
