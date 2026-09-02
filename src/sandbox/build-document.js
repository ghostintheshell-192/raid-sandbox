// @ts-check
/**
 * build-document.js — RAID Sandbox: a build as a DOCUMENT (save, load, share).
 *
 * Headless. Turns the mutable canvas state into a plain, versioned, JSON-able
 * document and back, and encodes a document as a short URL-safe string — so a
 * build can leave the process: be shared as a link (the goal the whole vanilla
 * stack was chosen for, `.claude/rules/overview.md`), kept as a fixture, diffed.
 *
 * What is written down is the BUILD — what the player placed, grouped, chose
 * and wired — never what the engine derives from it, and not the routing:
 * disk → acceptor edges are derived (cpAutoRoute) and are re-derived on load
 * from the catalogue, so a document never carries them; hand-drawn wires are.
 * Positions ride along only where they are the player's: a component's place
 * on the physical canvas, and a disk the player dragged there. The data view
 * lays the tree out in flow, so it has no positions to keep.
 *
 *   toDocument(state)         → doc
 *   loadDocument(state, doc)  → void    in place, after reset() — the state object is
 *                                       shared by both controllers and never reassigned
 *   encode(doc)               → string  URL-safe, compact (see WIRE FORMAT)
 *   decode(string)            → doc
 *
 * Document v1 (the readable form — what tests and tools see):
 *   { v: 1,
 *     disks:      [{ id, sizeGB, protocol, physPos? }],
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
 * WIRE FORMAT (encode/decode): the document as tuples, ids reduced to their
 * number (the section says the prefix), positions rounded to whole pixels,
 * then base64url. One leading letter says which form follows: 'c' compact,
 * or 'j' plain JSON for a document whose ids are not of the `prefix-N` form
 * (hand-written fixtures). A 6-disk RAID 50 with a wired path is ~500 chars.
 *
 * Depends on: canvas-state.js (CanvasState), model.js (the attribute vocabulary).
 */

(function (/** @type {any} */ root) {   // the UMD host: window, or Node's global
  'use strict';

  const CS    = (typeof require !== 'undefined') ? require('./canvas-state.js')  : root.CanvasState;
  const Model = (typeof require !== 'undefined') ? require('../engine/model.js') : root.RaidModel;

  const VERSION = 1;
  const fail = (msg) => { throw new Error(`build document: ${msg}`); };

  // ---------------------------------------------------------------------------
  // STATE → DOCUMENT
  // ---------------------------------------------------------------------------

  const copyPos = (p) => (p ? { x: p.x, y: p.y } : undefined);

  /** @param {SandboxState} state @returns {BuildDoc} */
  function toDocument(state) {
    const disks = [], arrays = [];
    for (const n of state.nodes.values()) {
      if (n.kind === 'disk') {
        const d = { id: n.id, sizeGB: n.sizeGB, protocol: n.protocol };
        const physPos = copyPos(state.cpDiskPositions.get(n.id));
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
   * @param {SandboxState} state @param {BuildDoc} doc
   */
  function loadDocument(state, doc) {
    validate(doc);
    CS.reset(state);

    let maxSeq = 0;
    const seen = (id) => { maxSeq = Math.max(maxSeq, idSuffix(id)); };

    for (const d of doc.disks) {
      state.nodes.set(d.id, { kind: 'disk', id: d.id, sizeGB: d.sizeGB, protocol: d.protocol });
      state.positions.set(d.id, { x: 0, y: 0 });
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
  // WIRE FORMAT — tuples, numeric ids, whole-pixel positions
  // ---------------------------------------------------------------------------

  const PREFIX = { disk: 'disk', array: 'array', comp: 'cpn', wire: 'cpe' };
  const idRe   = /^(disk|array|cpn|cpe)-(\d+)$/;
  const num    = (id) => Number(idRe.exec(id)[2]);
  const r      = (x) => Math.round(x);

  /** Every id of the `prefix-N` form, with the prefix its section expects? */
  function compactable(doc) {
    const ok = (id, prefix) => { const m = idRe.exec(id); return !!m && m[1] === prefix; };
    return doc.disks.every((d) => ok(d.id, PREFIX.disk))
        && doc.arrays.every((a) => ok(a.id, PREFIX.array)
             && a.members.every((m) => ok(m, PREFIX.disk) || ok(m, PREFIX.array)))
        && doc.components.every((c) => ok(c.id, PREFIX.comp))
        && doc.wires.every((w) => ok(w.id, PREFIX.wire) && ok(w.from, PREFIX.comp) && ok(w.to, PREFIX.comp));
  }

  // A member is a disk ("d12") or an array ("a3"): one letter says which.
  const memberOut = (m) => (m.startsWith('disk-') ? 'd' : 'a') + num(m);
  const memberIn  = (s) => (s[0] === 'd' ? 'disk-' : 'array-') + s.slice(1);

  function toCompact(doc) {
    return [VERSION,
      doc.disks.map((d) => d.physPos
        ? [num(d.id), d.sizeGB, d.protocol, r(d.physPos.x), r(d.physPos.y)]
        : [num(d.id), d.sizeGB, d.protocol]),
      doc.arrays.map((a) => [num(a.id), a.segmentation, a.redundancy, a.algorithm, a.members.map(memberOut)]),
      doc.components.map((c) => [num(c.id), c.componentId, r(c.pos.x), r(c.pos.y)]),
      doc.wires.map((w) => [num(w.id), num(w.from), w.fromPort, num(w.to), w.toPort]),
    ];
  }

  function fromCompact(t) {
    if (!Array.isArray(t) || t.length !== 5 || !t.slice(1).every(Array.isArray)) fail('malformed compact form');
    const id = (prefix, n) => `${prefix}-${n}`;
    return {
      v: t[0],
      disks: t[1].map((d) => (d.length > 3
        ? { id: id(PREFIX.disk, d[0]), sizeGB: d[1], protocol: d[2], physPos: { x: d[3], y: d[4] } }
        : { id: id(PREFIX.disk, d[0]), sizeGB: d[1], protocol: d[2] })),
      arrays: t[2].map((a) => ({ id: id(PREFIX.array, a[0]), segmentation: a[1], redundancy: a[2],
                                 algorithm: a[3], members: Array.isArray(a[4]) ? a[4].map(memberIn) : a[4] })),
      components: t[3].map((c) => ({ id: id(PREFIX.comp, c[0]), componentId: c[1], pos: { x: c[2], y: c[3] } })),
      wires: t[4].map((w) => ({ id: id(PREFIX.wire, w[0]), from: id(PREFIX.comp, w[1]), fromPort: w[2],
                                to: id(PREFIX.comp, w[3]), toPort: w[4] })),
    };
  }

  // ---------------------------------------------------------------------------
  // ENCODING — URL-safe base64, both runtimes, no dependency
  // ---------------------------------------------------------------------------

  function toBase64(utf8) {
    if (typeof Buffer !== 'undefined') return Buffer.from(utf8, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(utf8)));
  }
  function fromBase64(b64) {
    if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
    return decodeURIComponent(escape(atob(b64)));
  }
  const toUrlSafe   = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromUrlSafe = (s)   => s.replace(/-/g, '+').replace(/_/g, '/');

  /** @param {BuildDoc} doc @returns {string} */
  function encode(doc) {
    validate(doc);
    return compactable(doc)
      ? 'c' + toUrlSafe(toBase64(JSON.stringify(toCompact(doc))))
      : 'j' + toUrlSafe(toBase64(JSON.stringify(doc)));
  }

  /** @param {string} str @returns {BuildDoc} */
  function decode(str) {
    if (typeof str !== 'string' || str.length < 2) fail('nothing to decode');
    const form = str[0];
    if (form !== 'c' && form !== 'j') fail(`unknown form "${form}"`);
    let json;
    try { json = fromBase64(fromUrlSafe(str.slice(1))); } catch (e) { fail('not base64'); }
    let parsed;
    try { parsed = JSON.parse(json); } catch (e) { fail('not JSON'); }
    const doc = form === 'c' ? fromCompact(parsed) : parsed;
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
