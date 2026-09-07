/**
 * kb-markdown.js — the markdown subset the knowledge base is written in.
 *
 * The subset is declared once, in the header of data/kb/segmentation.yaml, and
 * this file is the whole implementation of it: `##` headings, paragraphs,
 * bulleted and numbered lists, bold, italic, inline code, fenced ```text
 * blocks, [[id]] / [[id|text]] cross-references, and footnotes — [^id] in the
 * text, `[^id]: …` on a line of its own — which render as a numbered "Notes"
 * section at the end of the body (ADR-004: a design choice of the sandbox is
 * explained where the reader meets it). Nothing else — no tables, no raw HTML,
 * no images, no autolinks. Anything outside the subset is either escaped as
 * plain text or, for a cross-reference or footnote that names nothing, an error.
 *
 * What it does NOT do: resolve links. The caller passes `resolveLink(id, text)`
 * and owns the map from an id to a page — this file holds no domain facts and
 * no knowledge of the site's layout (ADR-002). It also never renders `short`:
 * short forms are plain text and are escaped by the caller.
 *
 * Fenced blocks are emitted verbatim (escaped, never re-wrapped): the text
 * figures in the concept files rely on exact spacing and box-drawing characters.
 *
 *   render(markdown, { resolveLink, where })  → HTML string
 */

'use strict';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

// ---------------------------------------------------------------------------
// INLINE
// ---------------------------------------------------------------------------

// One alternation over already-escaped text, so a construct cannot be found
// inside another's delimiters by accident. Bold and italic recurse (a link
// inside bold is common); code never does — its content is literal.
// The (?!\s) / (?<!\s) guards keep a lone asterisk in a text line from opening
// an emphasis run that swallows the rest of the paragraph.
const INLINE = /`([^`]+)`|\[\^([a-z0-9-]+)\]|\[\[([^\]|]+)(?:\|([^\]]*))?\]\]|\*\*(?!\s)([\s\S]+?)(?<!\s)\*\*|\*(?!\s)([^*\n]+?)(?<!\s)\*/g;

function renderInline(text, ctx) {
  return expand(escapeHtml(text), ctx);
}

function expand(escaped, ctx) {
  INLINE.lastIndex = 0;
  return escaped.replace(INLINE, (match, code, fnId, linkId, linkText, bold, italic) => {
    if (code !== undefined)   return `<code>${code}</code>`;
    if (fnId !== undefined) {
      if (!ctx.footnote) throw new Error(`${ctx.where || 'markdown'}: a footnote [^${fnId}] outside a body`);
      return ctx.footnote(fnId);
    }
    if (linkId !== undefined) return ctx.resolveLink(unescapeForId(linkId).trim(),
                                                     linkText === undefined ? null : linkText.trim());
    if (bold !== undefined)   return `<strong>${expand(bold, ctx)}</strong>`;
    if (italic !== undefined) return `<em>${expand(italic, ctx)}</em>`;
    return match;
  });
}

// An id is matched inside already-escaped text, so an id containing one of the
// five escaped characters arrives as an entity. Ids are [a-z0-9-] in practice;
// this only keeps a malformed one readable in the error message.
const unescapeForId = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                              .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// ---------------------------------------------------------------------------
// BLOCKS
// ---------------------------------------------------------------------------

const FENCE   = /^```(\w*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET  = /^[-*]\s+(.*)$/;
const NUMBER  = /^\d+\.\s+(.*)$/;
const FOOTDEF = /^\[\^([a-z0-9-]+)\]:\s*(.*)$/;

// A footnote is referenced in the text as [^id] and defined once, anywhere in
// the body, as `[^id]: text`. References are numbered in order of first use;
// the definitions render as an ordered list under a "Notes" heading at the end
// of the body, each with a link back to its first reference. A reference with
// no definition, or a definition nobody references, is an error: a note that
// dangles is a claim nobody can read, or a claim nobody is told about.
function footnoteState(where) {
  const order = [];           // ids, in order of first reference
  const defs  = new Map();    // id → raw markdown
  return {
    ref(id) {
      let n = order.indexOf(id);
      const first = n < 0;
      if (first) { order.push(id); n = order.length - 1; }
      const anchor = first ? ` id="fnref-${id}"` : '';
      return `<sup class="kb-fn"><a href="#fn-${id}"${anchor}>${n + 1}</a></sup>`;
    },
    define(id, text) {
      if (defs.has(id)) throw new Error(`${where}: footnote [^${id}] is defined twice`);
      defs.set(id, text);
    },
    render(ctx) {
      for (const id of order) if (!defs.has(id)) throw new Error(`${where}: footnote [^${id}] is referenced but never defined`);
      for (const id of defs.keys()) if (!order.includes(id)) throw new Error(`${where}: footnote [^${id}] is defined but never referenced`);
      if (!order.length) return null;
      const items = order.map((id) =>
        `  <li id="fn-${id}">${renderInline(defs.get(id), { ...ctx, footnote: undefined })} <a href="#fnref-${id}" class="kb-fn-back" aria-label="Back to the text">↩</a></li>`);
      return `<section class="kb-footnotes" id="notes">\n<h2>Notes</h2>\n<ol>\n${items.join('\n')}\n</ol>\n</section>`;
    },
  };
}

/**
 * @param {string} markdown
 * @param {{ resolveLink: (id: string, text: string|null) => string, where?: string }} ctx
 * @returns {string} HTML
 */
function render(markdown, ctx) {
  const where = ctx.where || 'markdown';
  const lines = String(markdown == null ? '' : markdown).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const notes = footnoteState(where);
  ctx = { ...ctx, where, footnote: (id) => notes.ref(id) };

  let i = 0;
  while (i < lines.length) {
    const raw  = lines[i];
    const line = raw.trim();

    if (!line) { i++; continue; }

    // fenced block — verbatim, to the closing fence
    const fence = FENCE.exec(line);
    if (fence) {
      const body = [];
      const indent = raw.length - raw.trimStart().length;
      i++;
      let closed = false;
      while (i < lines.length) {
        if (FENCE.test(lines[i].trim())) { closed = true; i++; break; }
        body.push(lines[i].slice(indent));
        i++;
      }
      if (!closed) throw new Error(`${where}: a fenced block is never closed`);
      while (body.length && !body[body.length - 1].trim()) body.pop();
      out.push(`<pre class="kb-figure"><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    // heading — `##` in the source is an h2 on the page: the page's own title
    // (the entry's name) is the h1, and the generator's own sections (kb.css
    // `.kb-section h2`) are h2 too, so the author's top level sits at the same
    // depth as those and no page skips from h1 straight to h3.
    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 6);
      const text  = heading[2].trim();
      const id    = ctx.headingId ? ` id="${escapeHtml(ctx.headingId(text))}"` : '';
      out.push(`<h${level}${id}>${renderInline(text, ctx)}</h${level}>`);
      i++;
      continue;
    }

    // list — items may run over several lines; an indented continuation joins
    // the item above it. A blank line, a heading or a fence ends the list.
    if (BULLET.test(line) || NUMBER.test(line)) {
      const ordered = NUMBER.test(line);
      const items = [];
      while (i < lines.length) {
        const cur = lines[i];
        const t = cur.trim();
        if (!t) break;
        if (FENCE.test(t) || HEADING.test(t)) break;
        const item = ordered ? NUMBER.exec(t) : BULLET.exec(t);
        const other = ordered ? BULLET.exec(t) : NUMBER.exec(t);
        if (item) items.push([item[1]]);
        else if (other) break;                       // a list of the other kind starts
        else if (items.length) items[items.length - 1].push(t);
        else break;
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>`);
      for (const item of items) out.push(`  <li>${renderInline(item.join(' '), ctx)}</li>`);
      out.push(`</${tag}>`);
      continue;
    }

    // footnote definition — `[^id]: text`, continuing over following lines like
    // a paragraph; it is kept aside and rendered at the end of the body.
    const footdef = FOOTDEF.exec(line);
    if (footdef) {
      const text = [footdef[2]];
      i++;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t || FENCE.test(t) || HEADING.test(t) || BULLET.test(t) || NUMBER.test(t) || FOOTDEF.test(t)) break;
        text.push(t);
        i++;
      }
      notes.define(footdef[1], text.join(' '));
      continue;
    }

    // paragraph — to the next blank line, heading, fence, list or footnote
    const para = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t || FENCE.test(t) || HEADING.test(t) || BULLET.test(t) || NUMBER.test(t) || FOOTDEF.test(t)) break;
      para.push(t);
      i++;
    }
    out.push(`<p>${renderInline(para.join(' '), ctx)}</p>`);
  }

  const notesHtml = notes.render(ctx);
  if (notesHtml) out.push(notesHtml);
  return out.join('\n');
}

/** An anchor for a heading: lower-case, words joined by hyphens, nothing else. */
const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The `##` headings of a body of markdown, in order, with the ids `slug` gives them. */
function headingsOf(markdown) {
  return String(markdown == null ? '' : markdown).split('\n')
    .map((l) => /^\s*##\s+(.*)$/.exec(l)).filter(Boolean)
    .map((m) => ({ id: slug(m[1].trim()), title: m[1].trim() }));
}

/** The ids of the footnotes a body defines, in source order — empty when it has none. */
function footnotesOf(markdown) {
  return String(markdown == null ? '' : markdown).split('\n')
    .map((l) => FOOTDEF.exec(l.trim())).filter(Boolean).map((m) => m[1]);
}

module.exports = { render, renderInline, escapeHtml, slug, headingsOf, footnotesOf };
