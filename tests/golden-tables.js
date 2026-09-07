/**
 * golden-tables.js — reads the hand-derived golden tables the layout suite asserts
 * the engine against.
 *
 * The tables live in .development/reference/golden-tables/<layout>.md, each inside a
 * fenced block tagged `golden` (the form is in that directory's README). This file
 * turns one document into { name → { disks, roles, segs } }, in the shape
 * layout-golden.test.js compares with computePlacement()'s output. It reads the
 * repository with `fs` and nothing else: the suites stay dependency-free.
 *
 * It does not compute anything. A table that is not in a document does not exist —
 * that is the point (ADR-004): the derivation is the authority, the engine is what
 * is checked, and nothing here is produced by src/engine/layout.js.
 */

const fs   = require('fs');
const path = require('path');

const DIR  = path.join(__dirname, '..', '.development', 'reference', 'golden-tables');
const CELL = /^(?:([DM])(\d+)|P|Q)$/;

function parseBlock(text, where) {
  let name = null, disks = null;
  const roles = [], segs = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    let m;
    if ((m = /^name:\s*(\S+)$/.exec(line)))  { name = m[1]; return; }
    if ((m = /^disks:\s*(\d+)$/.exec(line))) { disks = Number(m[1]); return; }
    if ((m = /^(\d+):\s*(.+)$/.exec(line))) {
      const idx = Number(m[1]);
      if (idx !== roles.length) throw new Error(`${where}: stripe ${idx} out of order, expected ${roles.length}`);
      const r = [], s = [];
      for (const cell of m[2].trim().split(/\s+/)) {
        const cm = CELL.exec(cell);
        if (!cm) throw new Error(`${where}: cannot read cell "${cell}" in stripe ${idx}`);
        if (cell === 'P' || cell === 'Q') { r.push(cell); s.push(null); }
        else { r.push(cm[1] === 'D' ? 'data' : 'mirror'); s.push(Number(cm[2])); }
      }
      roles.push(r); segs.push(s);
      return;
    }
    throw new Error(`${where}: cannot read line ${i + 1}: "${raw}"`);
  });
  if (!name)          throw new Error(`${where}: a golden block needs a name:`);
  if (disks === null) throw new Error(`${where} ${name}: a golden block needs disks:`);
  if (!roles.length)  throw new Error(`${where} ${name}: a golden block needs at least one stripe`);
  roles.forEach((r, i) => {
    if (r.length !== disks) throw new Error(`${where} ${name}: stripe ${i} has ${r.length} cells, disks: ${disks}`);
  });
  return { name, disks, roles, segs };
}

/**
 * Read every `golden` block of one reference document.
 * @param {string} file — a filename inside the golden-tables directory
 * @returns {Object<string, {name: string, disks: number, roles: string[][], segs: (number|null)[][]}>}
 */
function readGoldenTables(file) {
  const text = fs.readFileSync(path.join(DIR, file), 'utf8');
  const out = {};
  const fence = /```golden\n([\s\S]*?)```/g;
  let m;
  while ((m = fence.exec(text))) {
    const table = parseBlock(m[1], file);
    if (out[table.name]) throw new Error(`${file}: two tables named ${table.name}`);
    out[table.name] = table;
  }
  if (!Object.keys(out).length) throw new Error(`${file}: no golden block found`);
  return out;
}

/** Every reference document in the directory, keyed by filename. */
function readAllGoldenTables() {
  const out = {};
  for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.md') && f !== 'README.md').sort()) {
    out[f] = readGoldenTables(f);
  }
  return out;
}

module.exports = { readGoldenTables, readAllGoldenTables, DIR };
