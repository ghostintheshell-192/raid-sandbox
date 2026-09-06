/**
 * capacity-template.js — evaluate a level's `reference.capacityTemplate`.
 *
 * The template is the level's capacity formula written so a machine can check
 * it (specs/planned/knowledge-base.md §6): `(N - 1) * size`, `N / copies * size`.
 * This file turns such a string into a number, so the knowledge-base test can
 * assert that the words on the page and `model.capacityGB()` agree.
 *
 * What it does NOT do: run arbitrary expressions. The grammar is closed —
 * decimal numbers, the three names N / size / copies, the four operators
 * + - * / and parentheses — parsed by hand, never handed to `eval` or `Function`.
 * A name the caller did not bind, a stray character, an unbalanced parenthesis:
 * each throws, naming the offending piece. It holds no domain facts: which
 * names exist and what they are worth is the caller's business.
 *
 * It lives under .development/scripts/lib/ because it is a documentation tool:
 * the generator and its test are its only callers, and src/engine/ is the
 * runtime the sandbox ships — a checker for a YAML documentation field has no
 * business there. Both callers require it by relative path; it is plain
 * CommonJS with no dependencies, so the headless suites stay zero-dependency.
 *
 *   evaluate('(N - 1) * size', { N: 4, size: 2 })  → 6
 */

'use strict';

const NAMES = ['N', 'size', 'copies'];

/**
 * @param {string} src   the template
 * @param {Record<string, number>} vars  the names the template may use
 * @param {string} [where]  a label for the error messages (the file it came from)
 * @returns {number}
 */
function evaluate(src, vars, where = 'capacity template') {
  if (typeof src !== 'string' || !src.trim()) throw new Error(`${where}: the template is empty`);

  const tokens = tokenize(src, where);
  let pos = 0;

  const peek = () => tokens[pos] || null;
  const take = () => tokens[pos++];

  // expression := term (('+' | '-') term)*
  function expression() {
    let value = term();
    for (let t = peek(); t && (t.value === '+' || t.value === '-'); t = peek()) {
      take();
      const rhs = term();
      value = t.value === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  // term := factor (('*' | '/') factor)*
  function term() {
    let value = factor();
    for (let t = peek(); t && (t.value === '*' || t.value === '/'); t = peek()) {
      take();
      const rhs = factor();
      if (t.value === '/' && rhs === 0) throw new Error(`${where}: division by zero`);
      value = t.value === '*' ? value * rhs : value / rhs;
    }
    return value;
  }

  // factor := '-'? ( number | name | '(' expression ')' )
  function factor() {
    const t = peek();
    if (!t) throw new Error(`${where}: the template ends where a value was expected`);
    if (t.value === '-') { take(); return -factor(); }
    if (t.value === '(') {
      take();
      const value = expression();
      const close = take();
      if (!close || close.value !== ')') throw new Error(`${where}: unbalanced parenthesis`);
      return value;
    }
    if (t.type === 'number') { take(); return t.number; }
    if (t.type === 'name') {
      take();
      if (!Object.prototype.hasOwnProperty.call(vars, t.value))
        throw new Error(`${where}: the template uses "${t.value}", which this build does not define`);
      const value = vars[t.value];
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new Error(`${where}: "${t.value}" is not a finite number (${JSON.stringify(value)})`);
      return value;
    }
    throw new Error(`${where}: unexpected "${t.value}"`);
  }

  const value = expression();
  if (pos < tokens.length) throw new Error(`${where}: trailing "${tokens[pos].value}"`);
  return value;
}

function tokenize(src, where) {
  const tokens = [];
  const re = /\s+|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/()])/y;
  let i = 0;
  while (i < src.length) {
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new Error(`${where}: cannot read "${src[i]}" at position ${i}`);
    i = re.lastIndex;
    if (m[1] !== undefined) tokens.push({ type: 'number', value: m[1], number: Number(m[1]) });
    else if (m[2] !== undefined) {
      if (!NAMES.includes(m[2])) throw new Error(`${where}: unknown name "${m[2]}" (the grammar has ${NAMES.join(', ')})`);
      tokens.push({ type: 'name', value: m[2] });
    } else if (m[3] !== undefined) tokens.push({ type: 'op', value: m[3] });
  }
  return tokens;
}

module.exports = { evaluate, NAMES };
