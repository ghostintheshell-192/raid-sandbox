/**
 * kb-markdown.js — the markdown subset the knowledge base is written in.
 *
 * The subset is declared once, in the header of data/kb/segmentation.yaml, and
 * this file is the whole implementation of it: `##` headings, paragraphs,
 * bulleted and numbered lists, bold, italic, inline code, fenced ```text
 * blocks, and [[id]] / [[id|text]] cross-references. Nothing else — no tables,
 * no raw HTML, no images, no autolinks. Anything outside the subset is either
 * escaped as plain text or, for a cross-reference that names nothing, an error.
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
const INLINE = /`([^`]+)`|\[\[([^\]|]+)(?:\|([^\]]*))?\]\]|\*\*(?!\s)([\s\S]+?)(?<!\s)\*\*|\*(?!\s)([^*\n]+?)(?<!\s)\*/g;

function renderInline(text, ctx) {
  return expand(escapeHtml(text), ctx);
}

function expand(escaped, ctx) {
  INLINE.lastIndex = 0;
  return escaped.replace(INLINE, (match, code, linkId, linkText, bold, italic) => {
    if (code !== undefined)   return `<code>${code}</code>`;
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

/**
 * @param {string} markdown
 * @param {{ resolveLink: (id: string, text: string|null) => string, where?: string }} ctx
 * @returns {string} HTML
 */
function render(markdown, ctx) {
  const where = ctx.where || 'markdown';
  const lines = String(markdown == null ? '' : markdown).replace(/\r\n?/g, '\n').split('\n');
  const out = [];

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

    // paragraph — to the next blank line, heading, fence or list
    const para = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t || FENCE.test(t) || HEADING.test(t) || BULLET.test(t) || NUMBER.test(t)) break;
      para.push(t);
      i++;
    }
    out.push(`<p>${renderInline(para.join(' '), ctx)}</p>`);
  }

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

module.exports = { render, renderInline, escapeHtml, slug, headingsOf };
