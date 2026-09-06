/**
 * kb-generator.test.js — the knowledge-base generator's output is a build
 * artefact that is COMMITTED, so it has to behave like one.
 * Run with: node kb-generator.test.js   (uses python3 + pyyaml to read the YAML
 * the pages are compared against; it runs the generator as a subprocess, so the
 * vendored parser stays inside that process and this suite keeps no dependency.)
 *
 * Four properties, each one a way a generated page has gone wrong before:
 *
 *   1. DETERMINISM. Two runs on the same input produce the same bytes. Without
 *      it every commit carries a diff nobody wrote, and the pre-commit hook
 *      that stages kb/ would make one on every commit;
 *   2. NO DEAD LINKS. Every local href points at a page this run produced, and
 *      every #fragment at an id that page actually has. The knowledge base is a
 *      hypertext whose links are generated from ids in YAML — the one place a
 *      typo becomes invisible;
 *   3. NO HOLES. No {placeholder} survives anywhere, and the short form
 *      transcluded onto a level page is byte-for-byte the one in the file it
 *      came from. Transclusion that quietly paraphrases is worse than none:
 *      the whole point is that the reader meets the same two sentences;
 *   4. NO SCRIPT. The pages are documents (ADR-003: the knowledge base is what a
 *      phone gets). The JSON-LD block (data, not code) and the Cookiebot /
 *      Consent Mode / gtag.js analytics block — byte-identical on every page,
 *      index.html is its source of truth — are the only <script> tags a page
 *      may carry; nothing else runs.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert, eq, finish } = require('./test-helpers.js');

const root      = path.join(__dirname, '..');
const generator = path.join(root, '.development', 'scripts', 'generate-kb.js');
const { metaDescription } = require(generator);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-generator-'));
// --sitemap redirects sitemap.xml the same way --out redirects the pages, so
// this run never touches the real, tracked sitemap.xml at the repo root.
const sitemapOf = (dir) => `${dir}.sitemap.xml`;
const runInto = (dir) => {
  try { execFileSync('node', [generator, '--out', dir, '--sitemap', sitemapOf(dir)], { encoding: 'utf8', cwd: root }); }
  catch (e) {
    console.error('the generator failed:', (e.stderr || e.stdout || e.message).toString());
    process.exit(1);
  }
};

const outA = path.join(tmp, 'a');
const outB = path.join(tmp, 'b');
runInto(outA);
runInto(outB);

const pageNames = fs.readdirSync(outA).filter((f) => f.endsWith('.html')).sort();
const pages = new Map(pageNames.map((f) => [f, fs.readFileSync(path.join(outA, f), 'utf8')]));

// ---------------------------------------------------------------------------
console.log('\n[0] metaDescription: whole sentences, capped at a boundary');

test('metaDescription: drops a second sentence that would push past the limit', () => {
  eq(metaDescription('The first sentence is short. The second one alone would still fit within the limit on its own, but not once added to the first.', 100),
    'The first sentence is short.');
});

test('metaDescription: keeps every whole sentence that still fits within the limit', () => {
  eq(metaDescription('One. Two. Three.', 100), 'One. Two. Three.');
});

test('metaDescription: keeps the first sentence even when it alone runs past the limit', () => {
  const oneLongSentence = 'This single sentence runs on for a good while, well past a hundred characters, with no period anywhere before its very end.';
  eq(metaDescription(oneLongSentence, 100), oneLongSentence);
});

// ---------------------------------------------------------------------------
console.log('\n[1] the generator is deterministic');

test('the same input produces the same set of pages', () => {
  eq(fs.readdirSync(outB).filter((f) => f.endsWith('.html')).sort().join(','), pageNames.join(','));
  assert(pageNames.length >= 4, `expected the map, the glossary, the concepts and at least one level, got ${pageNames.length}`);
});

for (const name of pageNames) {
  test(`${name} is byte-identical on a second run`, () => {
    const a = fs.readFileSync(path.join(outA, name));
    const b = fs.readFileSync(path.join(outB, name));
    assert(a.equals(b), `${name} differs between two runs of the same input`);
  });
}

test('the tracked kb/ is what the generator produces right now', () => {
  const tracked = path.join(root, 'kb');
  assert(fs.existsSync(tracked), 'kb/ is not in the repository — run the generator and commit it');
  for (const name of pageNames) {
    const committed = fs.readFileSync(path.join(tracked, name));
    assert(committed.equals(fs.readFileSync(path.join(outA, name))),
      `kb/${name} is stale — run .development/automation/docs-update.sh`);
  }
});

// ---------------------------------------------------------------------------
console.log('\n[2] every local link resolves');

const idsOf = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const hrefsOf = (html) => [...html.matchAll(/\shref="([^"]+)"/g)].map((m) => m[1]);
const pageIds = new Map([...pages].map(([name, html]) => [name, idsOf(html)]));

for (const [name, html] of pages) {
  test(`${name}: every local href points at a page and an anchor that exist`, () => {
    for (const href of hrefsOf(html)) {
      if (/^(https?:|mailto:|#|\.\.\/)/.test(href)) {
        if (!href.startsWith('#')) continue;                  // off-site, or out of kb/
        assert(pageIds.get(name).has(href.slice(1)), `${name}: "${href}" names no id on this page`);
        continue;
      }
      const [file, fragment] = href.split('#');
      assert(pages.has(file), `${name}: "${href}" points at ${file}, which is not generated`);
      if (fragment) assert(pageIds.get(file).has(fragment), `${name}: "${href}" names no id on ${file}`);
    }
  });
}

test('every page is reachable from the map', () => {
  const map = pages.get('index.html');
  assert(map, 'there is no index.html');
  const linked = new Set(hrefsOf(map).map((h) => h.split('#')[0]).filter((f) => pages.has(f)));
  for (const name of pageNames) {
    if (name === 'index.html') continue;
    assert(linked.has(name), `${name} is generated but the map does not link to it`);
  }
});

// ---------------------------------------------------------------------------
console.log('\n[3] no holes: no placeholder survives, and the transclusions are verbatim');

for (const [name, html] of pages) {
  test(`${name}: no {placeholder} is left in the page`, () => {
    const left = [...html.matchAll(/\{[A-Za-z_][A-Za-z0-9_]*\}/g)].map((m) => m[0]);
    // The JSON-LD block is JSON: its braces are structure, not placeholders.
    const body = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
    const inBody = [...body.matchAll(/\{[A-Za-z_][A-Za-z0-9_]*\}/g)].map((m) => m[0]);
    assert(inBody.length === 0, `${name}: ${inBody.join(', ')} was never filled in (${left.length} total)`);
  });
}

// The short forms, read from the YAML the way the other data suites read it.
const PY = `
import yaml, json, os, sys
base = sys.argv[1]
kb = {}
for f in sorted(os.listdir(os.path.join(base, 'data', 'kb'))):
    if f.endswith('.yaml'):
        with open(os.path.join(base, 'data', 'kb', f)) as fh:
            kb[f[:-5]] = yaml.safe_load(fh)['short']
print(json.dumps(kb))
`;
let shorts;
try {
  shorts = JSON.parse(execFileSync('python3', ['-c', PY, root], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
} catch (e) {
  console.error('Could not read data/kb via python3/pyyaml:', e.message);
  process.exit(1);
}

const unescape = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"')
                         .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const collapse = (s) => s.replace(/\s+/g, ' ').trim();

for (const [name, html] of pages) {
  if (name === 'index.html' || name === 'glossary.html') continue;
  const isLevel = html.includes('class="kb-body kb-body--level"');
  test(`${name}: every transcluded short form is the one in data/kb`, () => {
    // A transclusion is a .kb-short paragraph followed by its "read more" link:
    // the link names the page — and so the file — the text has to have come from.
    const re = /<p class="kb-short">([\s\S]*?)<\/p>\s*\n\s*<p class="kb-more"><a href="([^"#]+)\.html">/g;
    let found = 0;
    for (const m of html.matchAll(re)) {
      found++;
      const id = m[2];
      assert(shorts[id] !== undefined, `${name}: transcludes "${id}", which data/kb has no file for`);
      eq(collapse(unescape(m[1])), collapse(shorts[id]));
    }
    if (isLevel) assert(found > 0, `${name}: a level page transcludes no short form at all`);
  });
}

// ---------------------------------------------------------------------------
console.log('\n[4] the pages are documents: only the JSON-LD and the site-wide analytics block run');

// The Cookiebot / Consent Mode / gtag.js block is byte-identical on every page
// by construction (index.html is the source of truth, copied into the
// generator's head template) — these four <script> tags, in this order, plus
// the JSON-LD block are the only code any page may carry.
const ANALYTICS_SCRIPT_TAGS = [
  'id="Cookiebot" src="https://consent.cookiebot.com/uc.js" data-cbid="11322285-cc73-4d07-a7e8-be34dc027c4e" type="text/javascript" async',
  'data-cookieconsent="ignore"',
  'async src="https://www.googletagmanager.com/gtag/js?id=G-DQR5VQ6VXX"',
  '',
];

for (const [name, html] of pages) {
  test(`${name}: no <script> beyond the site-wide analytics block and the JSON-LD block`, () => {
    const tags = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1].trim());
    eq(tags.join('\n'), [...ANALYTICS_SCRIPT_TAGS, 'type="application/ld+json"'].join('\n'));
  });

  test(`${name}: the JSON-LD parses and claims only what the page has`, () => {
    const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    const ld = JSON.parse(m[1]);
    eq(ld['@type'], 'TechArticle');
    assert(ld.headline && ld.description && ld.url, 'headline, description and url are required');
    // kb/index.html is the map, linked everywhere as the directory `kb/`, not
    // as the file — every other page names itself.
    if (name === 'index.html') eq(ld.url, 'https://raid-sandbox.dev/kb/');
    else assert(ld.url.endsWith(`/kb/${name}`), `url "${ld.url}" does not name this page`);
    for (const forbidden of ['datePublished', 'dateModified', 'aggregateRating', 'reviewCount', 'review'])
      assert(!(forbidden in ld), `${name}: JSON-LD claims ${forbidden}, which this project does not have`);
  });

  test(`${name}: the meta description is a whole-sentence prefix of the full JSON-LD description`, () => {
    const meta = unescape(/<meta name="description" content="([^"]*)"/.exec(html)[1]);
    const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    const ld = JSON.parse(m[1]);
    assert(ld.description.startsWith(meta), `${name}: the meta description is not a prefix of the full JSON-LD description`);
    assert(/[.!?]$/.test(meta), `${name}: the meta description does not end at a sentence boundary`);
  });

  test(`${name}: Open Graph and Twitter card are present and consistent`, () => {
    const attr = (prop) => {
      const re = new RegExp(`<meta property="${prop}" content="([^"]*)"`);
      const hit = re.exec(html);
      return hit ? hit[1] : null;
    };
    const titleTag = /<title>([^<]*)<\/title>/.exec(html)[1];
    const descTag  = /<meta name="description" content="([^"]*)"/.exec(html)[1];
    const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)[1];

    eq(attr('og:type'), 'article');
    assert(attr('og:site_name'), `${name}: no og:site_name`);
    eq(attr('og:url'), canonical);
    eq(attr('og:title'), titleTag);
    eq(attr('og:description'), descTag);
    eq(attr('og:image'), 'https://raid-sandbox.dev/assets/og-image.png');
    eq(attr('og:image:width'), '1200');
    eq(attr('og:image:height'), '630');
    assert(attr('og:image:alt'), `${name}: no og:image:alt`);
    assert(/<meta name="twitter:card" content="summary_large_image">/.test(html), `${name}: no twitter:card`);
  });
}

// ---------------------------------------------------------------------------
console.log('\n[5] sitemap.xml is generated, not hand-maintained');

const sitemapA = fs.readFileSync(sitemapOf(outA), 'utf8');

test('sitemap.xml is byte-identical on a second run', () => {
  eq(fs.readFileSync(sitemapOf(outB), 'utf8'), sitemapA);
});

test('the tracked sitemap.xml is what the generator produces right now', () => {
  const tracked = path.join(root, 'sitemap.xml');
  assert(fs.existsSync(tracked), 'sitemap.xml is not in the repository');
  eq(fs.readFileSync(tracked, 'utf8'), sitemapA,
    'sitemap.xml is stale — run .development/automation/docs-update.sh');
});

test('sitemap.xml lists exactly the generated pages, home and kb/ included, no duplicates', () => {
  const locs = [...sitemapA.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  eq(new Set(locs).size, locs.length);
  const expected = new Set([
    'https://raid-sandbox.dev/',
    'https://raid-sandbox.dev/kb/',
    ...pageNames.filter((n) => n !== 'index.html').map((n) => `https://raid-sandbox.dev/kb/${n}`),
  ]);
  eq([...locs].sort().join('\n'), [...expected].sort().join('\n'));
});

test('sitemap.xml carries no <lastmod>, <changefreq> or <priority>', () => {
  for (const forbidden of ['lastmod', 'changefreq', 'priority'])
    assert(!sitemapA.includes(`<${forbidden}>`), `sitemap.xml has a <${forbidden}>, which this generator never dates`);
});

// ---------------------------------------------------------------------------
console.log('\n[6] heading levels never skip');

for (const [name, html] of pages) {
  test(`${name}: no heading skips a level (h1 → h2 → h3, never h1 → h3)`, () => {
    const levels = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
    let prev = 0;
    for (const level of levels) {
      assert(level <= prev + 1, `${name}: a heading jumps from h${prev} to h${level} with no h${prev + 1} between`);
      prev = level;
    }
  });
}

fs.rmSync(tmp, { recursive: true, force: true });
finish();
