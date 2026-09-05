// @ts-check
/**
 * levels.js — RAID Sandbox: the level catalogue and the SHAPE matcher (spec §4, §5c).
 *
 * PURE and headless. A level catalogue is built from a MANIFEST — the parsed
 * `data/raid-levels/index.yaml` plus every level file it lists — and answers
 * the founding question of axis B, "given this tree, what did I build?", by
 * matching the tree's shape against the shapes the files declare:
 *
 *   shape:
 *     segmentation: striped | linear
 *     redundancy:   none | mirror | parity1 | parity2
 *     members:      disks | arrays
 *     constraint?:  even-disk-count | odd-disk-count      (leaf shapes)
 *     childShape?:  a shape every member must match        (members: arrays)
 *
 * A leaf level may also say what it becomes below its minimum (spec:
 * implemented/degenerate-levels.md §5): `minDisksToRun` + `minDisksToRunSource`
 * (the width the real system still starts, with the kernel line that says so)
 * and `collapsesTo[]` (one `{ disks, becomes, because, source }` per width worth
 * explaining). This file validates them; it does not apply them — the rewrite
 * is model.js's job, and it composes bottom-up, which is why a nested level
 * never declares them: its spans carry the rule.
 *
 * The grammar is deliberately small: two attributes, a leaf/nested switch, a
 * parity constraint on the disk count, and "every member matches S" for the
 * nested levels. That is exactly what the hand-written recognizer used to
 * encode as code (the `childToken` / `uniformToken` machinery), and it is what
 * keeps a flat RAID 10 span apart from a mirror pair — RAID 100 vs RAID 1+0.
 *
 * What this file does NOT do: compute capacity, fault tolerance, performance or
 * placement — those are derivations over the same tree and stay in model.js
 * and layout.js; and it never reads files: the browser fetches the YAML and
 * hands the parsed objects in, the headless suites hand in a fixture that
 * `raid-levels-data.test.js` keeps aligned with the YAML.
 *
 *   assemble(index, filesById)   → manifest { levels: [def, …] }   (index order)
 *   createLevels(manifest)       → Levels                          (throws on a malformed manifest)
 *   levels.match(node)           → the first level def whose shape the node has, or null
 *   levels.reasonFor(def, node)  → the def's `reason` with `{n}` = member count
 *
 * Depends on: model.js (the attribute vocabulary, for validation only).
 */

(function (/** @type {any} */ root) {   // the UMD host: window, or Node's global
  'use strict';

  const Model = (typeof require !== 'undefined') ? require('./model.js') : root.RaidModel;

  const fail = (msg) => { throw new Error(`levels: ${msg}`); };

  const MEMBERS     = ['disks', 'arrays'];
  const CONSTRAINTS = ['even-disk-count', 'odd-disk-count'];

  // ---------------------------------------------------------------------------
  // ASSEMBLY — index.yaml + level files → manifest (the ONE path, browser + tests)
  // ---------------------------------------------------------------------------

  /**
   * @param {{ id: string, name: string }[]} index
   * @param {Record<string, LevelDef>} filesById
   * @returns {{ levels: LevelDef[] }}
   */
  function assemble(index, filesById) {
    if (!Array.isArray(index)) fail('index: expected a list of { id, name }');
    const levels = index.map((entry) => {
      if (!entry || !entry.id || !entry.name) fail('index: every entry needs an id and a name');
      const def = filesById[entry.id];
      if (!def) fail(`index: ${entry.id}.yaml was not loaded`);
      if (def.id !== entry.id) fail(`${entry.id}.yaml: id "${def.id}" does not match the index entry`);
      if (def.name !== entry.name) fail(`${entry.id}.yaml: name "${def.name}" does not match the index ("${entry.name}")`);
      return def;
    });
    return { levels };
  }

  // ---------------------------------------------------------------------------
  // VALIDATION — fail fast, name the offending piece
  // ---------------------------------------------------------------------------

  function validateShape(shape, where) {
    if (!shape || typeof shape !== 'object') fail(`${where}: shape must be an object`);
    if (!Model.SEGMENTATIONS.includes(shape.segmentation))
      fail(`${where}: shape.segmentation "${shape.segmentation}" is not one of ${Model.SEGMENTATIONS.join(', ')}`);
    if (!Model.REDUNDANCIES.includes(shape.redundancy))
      fail(`${where}: shape.redundancy "${shape.redundancy}" is not one of ${Model.REDUNDANCIES.join(', ')}`);
    if (!MEMBERS.includes(shape.members))
      fail(`${where}: shape.members "${shape.members}" is not one of ${MEMBERS.join(', ')}`);
    if (shape.constraint !== undefined && !CONSTRAINTS.includes(shape.constraint))
      fail(`${where}: shape.constraint "${shape.constraint}" is not one of ${CONSTRAINTS.join(', ')}`);
    if (shape.members === 'arrays') {
      if (!shape.childShape) fail(`${where}: members: arrays needs a childShape`);
      validateShape(shape.childShape, `${where}.childShape`);
    } else if (shape.childShape !== undefined) {
      fail(`${where}: childShape only makes sense with members: arrays`);
    }
  }

  // The collapse keys are optional on a leaf level (the data test insists on
  // them for the real files) and forbidden on a nested one: the collapse
  // composes from the spans (spec §3), so a rule on the outer level would be a
  // second statement of the same fact, free to drift.
  const COLLAPSE_KEYS = ['minDisksToRun', 'minDisksToRunSource', 'collapsesTo', 'absorbsNested'];

  function validateCollapses(def) {
    if (def.shape.members !== 'disks') {
      for (const key of COLLAPSE_KEYS)
        if (def[key] !== undefined)
          fail(`${def.id}: ${key} belongs on a leaf level — a nested level's spans carry it`);
      return;
    }
    if (def.minDisksToRun !== undefined) {
      if (!Number.isInteger(def.minDisksToRun) || def.minDisksToRun < 2 || def.minDisksToRun > def.minDisks)
        fail(`${def.id}: minDisksToRun must be a whole number from 2 to minDisks (${def.minDisks})`);
      if (typeof def.minDisksToRunSource !== 'string' || !def.minDisksToRunSource)
        fail(`${def.id}: minDisksToRun needs a minDisksToRunSource (the kernel line, or the algebra)`);
    } else if (def.minDisksToRunSource !== undefined) {
      fail(`${def.id}: minDisksToRunSource without a minDisksToRun`);
    }
    if (def.absorbsNested !== undefined) {
      const a = def.absorbsNested;
      if (!a || typeof a !== 'object') fail(`${def.id}: absorbsNested must be { because, source }`);
      if (typeof a.because !== 'string' || !a.because) fail(`${def.id}: absorbsNested.because is required (the player-facing sentence)`);
      if (typeof a.source !== 'string' || !a.source) fail(`${def.id}: absorbsNested.source is required (the algebra, or the kernel line)`);
    }
    if (def.collapsesTo === undefined) return;
    if (!Array.isArray(def.collapsesTo)) fail(`${def.id}: collapsesTo must be a list`);
    const widths = new Set();
    def.collapsesTo.forEach((c, i) => {
      const where = `${def.id}: collapsesTo[${i}]`;
      if (!c || typeof c !== 'object') fail(`${where}: expected { disks, becomes, because, source }`);
      if (!Number.isInteger(c.disks) || c.disks < 2 || c.disks >= def.minDisks)
        fail(`${where}: disks must be a whole number from 2 to minDisks − 1 (${def.minDisks - 1})`);
      if (widths.has(c.disks)) fail(`${where}: a second entry for ${c.disks} disks`);
      widths.add(c.disks);
      if (!constraintHolds(def.shape.constraint, c.disks))
        fail(`${where}: ${c.disks} disks never have this shape (${def.shape.constraint}) — the entry could not fire`);
      const b = c.becomes;
      if (!b || typeof b !== 'object') fail(`${where}: becomes must be a shape { segmentation, redundancy }`);
      if (!Model.SEGMENTATIONS.includes(b.segmentation))
        fail(`${where}: becomes.segmentation "${b.segmentation}" is not one of ${Model.SEGMENTATIONS.join(', ')}`);
      if (!Model.REDUNDANCIES.includes(b.redundancy))
        fail(`${where}: becomes.redundancy "${b.redundancy}" is not one of ${Model.REDUNDANCIES.join(', ')}`);
      if (b.segmentation === def.shape.segmentation && b.redundancy === def.shape.redundancy)
        fail(`${where}: becomes is the level's own shape — a rewrite to itself explains nothing`);
      if (typeof c.because !== 'string' || !c.because) fail(`${where}: because is required (the player-facing sentence)`);
      if (typeof c.source !== 'string' || !c.source) fail(`${where}: source is required (the kernel line, or the algebra)`);
    });
  }

  function validate(manifest) {
    if (!manifest || !Array.isArray(manifest.levels)) fail('manifest.levels must be a list');
    const seen = new Set();
    for (const def of manifest.levels) {
      if (!def || typeof def.id !== 'string' || !def.id) fail('a level has no id');
      if (seen.has(def.id)) fail(`duplicate level id "${def.id}"`);
      seen.add(def.id);
      if (typeof def.name !== 'string' || !def.name) fail(`${def.id}: name is required`);
      if (typeof def.reason !== 'string' || !def.reason) fail(`${def.id}: reason is required (the recognizer's one-line why)`);
      if (typeof def.minDisks !== 'number' || def.minDisks < 1) fail(`${def.id}: minDisks must be a positive number`);
      if (def.advisory !== undefined && typeof def.advisory !== 'string') fail(`${def.id}: advisory must be a string`);
      validateShape(def.shape, def.id);
      validateCollapses(def);
    }
  }

  // ---------------------------------------------------------------------------
  // MATCHING
  // ---------------------------------------------------------------------------

  const isDisk    = (n) => n && n.kind === 'disk';
  const isArray   = (n) => n && n.kind === 'array';
  const allDisks  = (a) => a.members.length > 0 && a.members.every(isDisk);
  const allArrays = (a) => a.members.length > 0 && a.members.every(isArray);

  function constraintHolds(constraint, count) {
    if (constraint === 'even-disk-count') return count % 2 === 0;
    if (constraint === 'odd-disk-count')  return count % 2 === 1;
    return true;
  }

  /**
   * Does `node` have `shape`? Recursive through childShape; uniform members.
   * @param {TreeNode} node @param {Shape} shape
   * @returns {boolean}
   */
  function matchShape(node, shape) {
    if (!isArray(node)) return false;
    const arr = /** @type {ArrayNode} */ (node);
    if (arr.segmentation !== shape.segmentation || arr.redundancy !== shape.redundancy) return false;
    if (shape.members === 'disks')
      return allDisks(arr) && constraintHolds(shape.constraint, arr.members.length);
    return allArrays(arr) && arr.members.every((m) => matchShape(m, shape.childShape));
  }

  // ---------------------------------------------------------------------------
  // CATALOGUE
  // ---------------------------------------------------------------------------

  /**
   * @param {{ levels: LevelDef[] }} manifest
   * @returns {Levels}
   */
  function createLevels(manifest) {
    validate(manifest);
    const order = manifest.levels.slice();
    const byId  = new Map(order.map((def) => [def.id, def]));

    const ids = () => order.map((d) => d.id);
    const get = (id) => byId.get(id) || null;

    /** The first level (index order) whose shape the node has, or null. */
    function match(node) {
      for (const def of order) if (matchShape(node, def.shape)) return def;
      return null;
    }

    const reasonFor = (def, node) =>
      def.reason.replace(/\{n\}/g, String(isArray(node) ? node.members.length : 0));

    return { ids, get, order, match, matchShape, reasonFor, manifest };
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  const RaidLevels = { assemble, createLevels, matchShape, MEMBERS, CONSTRAINTS };

  if (typeof module !== 'undefined' && module.exports) module.exports = RaidLevels;
  else root.RaidLevels = RaidLevels;

})(typeof globalThis !== 'undefined' ? globalThis : this);
