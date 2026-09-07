/**
 * kb-markdown.test.js — the footnotes of the knowledge-base markdown subset.
 * Run with: node kb-markdown.test.js
 *
 * ADR-004: a design choice of the sandbox is explained where the reader meets
 * it — a mark on the sentence, the note at the foot of the page. This suite
 * holds the renderer to that: numbering by first use, a way back, and a loud
 * failure for a note that dangles in either direction. The rest of the subset
 * is exercised end-to-end by kb-generator.test.js on the real pages.
 */

const { render, footnotesOf } = require('../.development/scripts/lib/kb-markdown.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

const ctx = { resolveLink: (id, text) => `<a href="${id}.html">${text || id}</a>`, where: 'test' };
const throws = (fn, part) => {
  try { fn(); } catch (e) { assert(e.message.includes(part), `expected "${part}" in: ${e.message}`); return; }
  throw new Error(`expected an error containing "${part}"`);
};

console.log('\n[1] a footnote renders as a numbered mark and a Notes section');

test('reference in the text, definition at the end', () => {
  const html = render('Q sits before P.[^ddf]\n\n[^ddf]: A design choice: the DDF convention.', ctx);
  assert(html.includes('<p>Q sits before P.<sup class="kb-fn"><a href="#fn-ddf" id="fnref-ddf">1</a></sup></p>'), html);
  assert(html.includes('<section class="kb-footnotes" id="notes">'), html);
  assert(html.includes('<h2>Notes</h2>'), html);
  assert(html.includes('<li id="fn-ddf">A design choice: the DDF convention. <a href="#fnref-ddf" class="kb-fn-back" aria-label="Back to the text">↩</a></li>'), html);
});

test('numbers follow the order of first reference, not of definition', () => {
  const html = render('First[^b] then[^a] and again[^b].\n\n[^a]: A.\n[^b]: B.', ctx);
  assert(html.includes('First<sup class="kb-fn"><a href="#fn-b" id="fnref-b">1</a></sup>'), html);
  assert(html.includes('then<sup class="kb-fn"><a href="#fn-a" id="fnref-a">2</a></sup>'), html);
  assert(html.includes('again<sup class="kb-fn"><a href="#fn-b">1</a></sup>'), 'a second reference keeps the number and gets no id');
  assert(html.indexOf('<li id="fn-b">') < html.indexOf('<li id="fn-a">'), 'the list is in reference order');
});

test('a definition may run over several lines and carry inline markup', () => {
  const html = render('Text.[^n]\n\n[^n]: A choice of the **sandbox**,\n  see [[design-decisions|the model\'s choices]].', ctx);
  assert(html.includes('<li id="fn-n">A choice of the <strong>sandbox</strong>, see <a href="design-decisions.html">the model&#39;s choices</a>. <a href="#fnref-n"'), html);
});

test('a body with no footnotes has no Notes section, and footnotesOf is empty', () => {
  const html = render('Plain text.\n\n## Heading\n\nMore.', ctx);
  assert(!html.includes('kb-footnotes'), html);
  eq(footnotesOf('Plain text.').length, 0);
  eq(footnotesOf('x[^a]\n\n[^a]: one\n[^b]: two').join(','), 'a,b');
});

console.log('\n[2] a note that dangles is an error');

test('a reference without a definition', () => throws(() => render('Text.[^gone]', ctx), 'referenced but never defined'));
test('a definition nobody references', () => throws(() => render('Text.\n\n[^orphan]: note', ctx), 'defined but never referenced'));
test('a definition given twice', () => throws(() => render('T.[^d]\n\n[^d]: one\n\n[^d]: two', ctx), 'defined twice'));

console.log('\n[3] the mark is literal inside code');

test('[^x] inside backticks is not a footnote', () => {
  const html = render('Write `[^x]` literally.', ctx);
  assert(html.includes('<code>[^x]</code>'), html);
  assert(!html.includes('kb-fn'), html);
});

finish();
