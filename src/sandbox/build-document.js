/**
 * build-document.js — RAID Sandbox: a build as a DOCUMENT (save, load, share).
 *
 * Headless. Turns the mutable canvas state into a plain, versioned, JSON-able
 * document and back, and encodes a document as a URL-safe string — so a build
 * can leave the process: be shared as a link (the goal the whole vanilla stack
 * was chosen for, `.claude/rules/overview.md`), kept as a test fixture, diffed.
 *
 * What is written down is the BUILD — what the player placed, grouped, chose
 * and wired — never what the engine derives from it, and not the routing:
 * disk → acceptor edges are derived (cpAutoRoute) and are re-derived on load
 * from the catalogue, so a document never carries them; hand-drawn wires are.
 * Positions ride along: they are the player's, not derived.
 *
 *   toDocument(state)         → doc
 *   loadDocument(state, doc)  → void    in place, after reset() — the state object is
 *                                       shared by both controllers and never reassigned
 *   encode(doc)               → string  URL-safe base64 of compact JSON
 *   decode(string)            → doc
 *
 * Document v1:
 *   { v: 1,
 *     disks:      [{ id, sizeGB, protocol, pos?, physPos? }],
 *     arrays:     [{ id, segmentation, redundancy, algorithm, members: [id, …] }],
 *     components: [{ id, componentId, pos }],
 *     wires:      [{ id, from, fromPort, to, toPort }] }
 *
 * Ids are kept verbatim, so a violation's nodeId, a fixture and a URL all point
 * at the same thing; the state's id counter continues past the largest id
 * loaded. loadDocument fails fast on a document it cannot honour — unknown
 * version, a member naming no node, a node claimed twice, a wire the catalogue
 * forbids — and names the piece. Nothing is loaded from a document that fails.
 *
 * Depends on: canvas-state.js (CanvasState), model.js (the attribute vocabulary).
 */

(function (root) {
  'use strict';

  const CS    = (typeof require !== 'undefined') ? require('./canvas-state.js')  : root.CanvasState;
  const Model = (typeof require !== 'undefined') ? require('../engine/model.js') : root.RaidModel;

  const VERSION = 1;
  const fail = (msg) => { throw new Error(`build document: ${msg}`); };

  // ---------------------------------------------------------------------------
  // STATE → DOCUMENT
  // ---------------------------------------------------------------------------

  const copyPos = (p) => (p ? { x: p.x, y: p.y } : undefined);

  function toDocument(state) {
    const disks = [], arrays = [];
    for (const n of state.nodes.values()) {
      if (n.kind === 'disk') {
        const d = { id: n.id, sizeGB: n.sizeGB, protocol: n.protocol };
        const pos = copyPos(state.positions.get(n.id));
        const physPos = copyPos(state.cpDiskPositions.get(n.id));
        if (pos) d.pos = pos;
        if (physPos) d.physPos = physPos;
        disks.push(d);
      } else if (n.kind === 'array') {
        arrays.push({ id: n.id, segmentation: n.segmentation, redundancy: n.redundancy,
                      algorithm: n.algorithm ?? null, members: n.members.slice() });
      }
    }
    const components = Array.from(state.cpNodes.values())
      .map((n) => ({ id: n.id, componentId: n.componentId, pos: copyPos(n.pos) || { x: 0, y: 0 } }));
    const wires = Array.from(state.cpEdges.values())
      .filter((e) => !e.derived)
      .map((e) => ({ id: e.id, from: e.fromNode, fromPort: e.fromPort, to: e.toNode, toPort: e.toPort }));
    return { v: VERSION, disks, arrays, components, wires };
  }

  // ---------------------------------------------------------------------------
  // DOCUMENT → STATE
  // ---------------------------------------------------------------------------

  const isPos = (p) => p && typeof p.x === 'number' && typeof p.y === 'number';

  /** Structural validation: everything that can be checked without the catalogue. */
  function validate(doc) {
    if (!doc || typeof doc !== 'object') fail('not an object');
    if (doc.v !== VERSION) fail(`unknown version ${JSON.stringify(doc.v)} (this build reads v${VERSION})`);
    for (const key of ['disks', 'arrays', 'components', 'wires'])
      if (!Array.isArray(doc[key])) fail(`${key} must be a list`);

    const ids = new Set();
    const claim = (id, what) => {
      if (typeof id !== 'string' || !id) fail(`${what} has no id`);
      if (ids.has(id)) fail(`duplicate id "${id}"`);
      ids.add(id);
    };
    for (const d of doc.disks) {
      claim(d.id, 'a disk');
      if (typeof d.sizeGB !== 'number' || !(d.sizeGB > 0)) fail(`${d.id}: sizeGB must be a positive number`);
      if (typeof d.protocol !== 'string' || !d.protocol) fail(`${d.id}: protocol is required`);
      if (d.pos !== undefined && !isPos(d.pos)) fail(`${d.id}: pos must be { x, y }`);
      if (d.physPos !== undefined && !isPos(d.physPos)) fail(`${d.id}: physPos must be { x, y }`);
    }
    for (const a of doc.arrays) {
      claim(a.id, 'an array');
      if (a.segmentation != null && !Model.SEGMENTATIONS.includes(a.segmentation))
        fail(`${a.id}: unknown segmentation "${a.segmentation}"`);
      if (a.redundancy != null && !Model.REDUNDANCIES.includes(a.redundancy))
        fail(`${a.id}: unknown redundancy "${a.redundancy}"`);
      if (a.algorithm != null && typeof a.algorithm !== 'string') fail(`${a.id}: algorithm must be a string or null`);
      if (!Array.isArray(a.members)) fail(`${a.id}: members must be a list`);
    }
    for (const c of doc.components) {
      claim(c.id, 'a component');
      if (typeof c.componentId !== 'string' || !c.componentId) fail(`${c.id}: componentId is required`);
      if (!isPos(c.pos)) fail(`${c.id}: pos must be { x, y }`);
    }
    for (const w of doc.wires) {
      claim(w.id, 'a wire');
      for (const k of ['from', 'fromPort', 'to', 'toPort'])
        if (typeof w[k] !== 'string' || !w[k]) fail(`${w.id}: ${k} is required`);
    }

    // Membership: every member exists, is a disk or an array, and is claimed once.
    const nodeIds = new Set([...doc.disks.map((d) => d.id), ...doc.arrays.map((a) => a.id)]);
    const claimed = new Set();
    for (const a of doc.arrays)
      for (const m of a.members) {
        if (!nodeIds.has(m)) fail(`${a.id}: member "${m}" names no disk or array`);
        if (m === a.id) fail(`${a.id}: an array cannot be its own member`);
        if (claimed.has(m)) fail(`"${m}" is a member of two arrays`);
        claimed.add(m);
      }
    const compIds = new Set(doc.components.map((c) => c.id));
    for (const w of doc.wires) {
      if (!compIds.has(w.from)) fail(`${w.id}: from "${w.from}" names no component`);
      if (!compIds.has(w.to))   fail(`${w.id}: to "${w.to}" names no component`);
    }
  }

  const idSuffix = (id) => { const m = /-(\d+)$/.exec(id); return m ? Number(m[1]) : 0; };

  /**
   * Replace the state's build with the document's, in place. Validates first,
   * so a bad document leaves the state untouched; wires go through cpConnect,
   * so one the catalogue forbids fails loudly (and the state is then reset,
   * not half-loaded).
   */
  function loadDocument(state, doc) {
    validate(doc);
    CS.reset(state);

    let maxSeq = 0;
    const seen = (id) => { maxSeq = Math.max(maxSeq, idSuffix(id)); };

    for (const d of doc.disks) {
      state.nodes.set(d.id, { kind: 'disk', id: d.id, sizeGB: d.sizeGB, protocol: d.protocol });
      state.positions.set(d.id, copyPos(d.pos) || { x: 0, y: 0 });
      if (d.physPos) state.cpDiskPositions.set(d.id, copyPos(d.physPos));
      seen(d.id);
    }
    const claimed = new Set();
    for (const a of doc.arrays) {
      state.nodes.set(a.id, { kind: 'array', id: a.id, segmentation: a.segmentation ?? null,
                              redundancy: a.redundancy ?? null, algorithm: a.algorithm ?? null,
                              members: a.members.slice() });
      a.members.forEach((m) => claimed.add(m));
      seen(a.id);
    }
    for (const id of state.nodes.keys()) if (!claimed.has(id)) state.roots.add(id);

    for (const c of doc.components) {
      state.cpNodes.set(c.id, { id: c.id, componentId: c.componentId, pos: copyPos(c.pos) });
      seen(c.id);
    }
    state._seq = Math.max(state._seq, maxSeq);

    try {
      for (const w of doc.wires) {
        const can = CS.cpCanConnect(state, w.from, w.fromPort, w.to, w.toPort);
        if (!can.ok) fail(`${w.id}: ${can.reason}`);
        // Keep the document's id: connect, then rename the edge it made.
        const made = CS.cpConnect(state, w.from, w.fromPort, w.to, w.toPort);
        const edge = state.cpEdges.get(made);
        state.cpEdges.delete(made);
        edge.id = w.id;
        state.cpEdges.set(w.id, edge);
        seen(w.id);
      }
    } catch (e) {
      CS.reset(state);
      throw e;
    }
    state._seq = Math.max(state._seq, maxSeq);
    CS.cpAutoRoute(state);
  }

  // ---------------------------------------------------------------------------
  // ENCODING — URL-safe base64 of compact JSON, both runtimes, no dependency
  // ---------------------------------------------------------------------------

  function toBase64(utf8) {
    if (typeof Buffer !== 'undefined') return Buffer.from(utf8, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(utf8)));
  }
  function fromBase64(b64) {
    if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
    return decodeURIComponent(escape(atob(b64)));
  }

  function encode(doc) {
    return toBase64(JSON.stringify(doc)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(str) {
    if (typeof str !== 'string' || !str) fail('nothing to decode');
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    let json;
    try { json = fromBase64(b64); } catch (e) { fail('not base64'); }
    let doc;
    try { doc = JSON.parse(json); } catch (e) { fail('not JSON'); }
    validate(doc);
    return doc;
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  const BuildDocument = { VERSION, toDocument, loadDocument, validate, encode, decode };

  if (typeof module !== 'undefined' && module.exports) module.exports = BuildDocument;
  else root.BuildDocument = BuildDocument;

})(typeof globalThis !== 'undefined' ? globalThis : this);
