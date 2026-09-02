/**
 * canvas-state.js — RAID Sandbox: mutable canvas state + evaluation pipeline.
 *
 * Two orthogonal axes (spec §2):
 *   Axis B (data layout) — disk/array tree; recognizer derives the RAID level.
 *   Axis A (control path) — the physical path disks→backplane→controller→CPU→OS;
 *                           which engine object sits on it derives hardware/fake/
 *                           software RAID (ADR-001) — position carries no weight.
 *
 * Positions are kept in a separate map so the drag fast-path (requestAnimationFrame)
 * can update pixel coordinates without touching domain state or triggering evaluate().
 * evaluate() is called once per gesture (on drop), never during drag — and it is
 * PURE: every derivation lives in src/engine/, and routing the disks is a
 * mutation (it happens when a disk or a component is added or removed), not a
 * side effect of asking for a verdict.
 *
 * This file owns the mutable state and nothing else: no rule about RAID is
 * decided here. The physical verdict is engine/physical.js; what may be wired
 * to what is the component catalogue (engine/catalog.js), built from
 * data/components/*.yaml and handed in via createState({ catalog }) or
 * setCatalog(). Without a catalogue nothing physical can be placed or routed.
 *
 * Depends on: model.js (RaidModel), layout.js (RaidLayout), validator.js
 * (RaidValidator), physical.js (RaidPhysical)
 *
 * Axis A mutations:
 *   CanvasState.cpAddNode(state, componentId, pos)        → id   (re-routes the disks)
 *   CanvasState.cpRemoveNode(state, nodeId)               → void (re-routes the disks)
 *   CanvasState.cpCanConnect(state, from, fromPort, to, toPort) → { ok, reason? }
 *   CanvasState.cpConnect(state, from, fromPort, to, toPort)    → id, or THROWS if not ok
 *   CanvasState.cpDisconnect(state, edgeId)               → bool (false for a derived disk edge)
 *   CanvasState.cpAutoRoute(state)                        → void (idempotent; called by the above)
 *
 * Axis B mutations:
 *   CanvasState.addDisk(state, sizeGB, protocol, pos)     → id
 *   CanvasState.group(state, memberIds)                   → id
 *   CanvasState.addToArray(state, arrayId, diskId)        → void
 *   CanvasState.setSegmentation(state, arrayId, value)    → void
 *   CanvasState.setRedundancy(state, arrayId, value)      → void
 *   CanvasState.setAlgorithm(state, arrayId, value)       → void
 *   CanvasState.dissolve(state, arrayId)                  → void
 *   CanvasState.remove(state, id)                         → void
 *   CanvasState.move(state, diskId, pos)                  → void  (fast path)
 *
 *   CanvasState.evaluate(state, opts)                     → EvalResult
 */

(function (root) {
  'use strict';

  const Model     = (typeof require !== 'undefined') ? require('../engine/model.js')     : root.RaidModel;
  const Layout    = (typeof require !== 'undefined') ? require('../engine/layout.js')    : root.RaidLayout;
  const Validator = (typeof require !== 'undefined') ? require('../engine/validator.js') : root.RaidValidator;
  const Physical  = (typeof require !== 'undefined') ? require('../engine/physical.js')  : root.RaidPhysical;

  // ---------------------------------------------------------------------------
  // ID GENERATION
  // ---------------------------------------------------------------------------

  let _seq = 0;
  const nextId = (prefix) => `${prefix}-${++_seq}`;

  // ---------------------------------------------------------------------------
  // STATE FACTORY
  // ---------------------------------------------------------------------------

  /**
   * Create a fresh, empty canvas state.
   *
   * nodes     — all canvas nodes (disks + arrays), keyed by id
   * roots     — top-level node ids (not a member of any array)
   * positions — disk pixel positions; updated at 60 fps during drag (fast path)
   * selected  — currently selected node ids
   * catalog   — the component catalogue (engine/catalog.js), or null until one is
   *             set; it is DATA, not build state, so reset() leaves it alone
   */
  function createState(opts = {}) {
    return {
      catalog:   opts.catalog || null,
      levels:    opts.levels  || null,   // the level catalogue (engine/levels.js) — data, like catalog
      // Axis B — data layout
      nodes:     new Map(),
      roots:     new Set(),
      positions: new Map(),
      selected:  new Set(),
      // Axis A — physical layer (graph of component nodes + edges)
      cpNodes: new Map(),   // id → { id, componentId, pos:{x,y} }
      cpEdges: new Map(),   // id → { id, fromNode, fromPort, toNode, toPort }
      // Bridge (Option 2): the disk is the shared atom. Disks live in `nodes`
      // (one identity); the physical view gives each its own position here and
      // references it directly in cpEdges by its disk id.
      cpDiskPositions: new Map(),  // diskId → {x,y}  (position in the physical view)
    };
  }

  /**
   * Wipe the whole build IN PLACE (master clear). Mutates the existing state
   * object — never reassigns it — so both controllers keep their reference.
   * Clears both axes; mode/challenge selection lives in the UI and is untouched.
   */
  function reset(state) {
    state.nodes.clear();
    state.roots.clear();
    state.positions.clear();
    state.selected.clear();
    state.cpNodes.clear();
    state.cpEdges.clear();
    state.cpDiskPositions.clear();
  }

  /**
   * Hand the state its component catalogue (the browser does this once the
   * YAML has loaded). Disks that were waiting for somewhere to route to are
   * routed now.
   */
  function setCatalog(state, catalog) {
    state.catalog = catalog || null;
    cpAutoRoute(state);
  }

  /** Hand the state its level catalogue (the browser does this once the YAML has loaded). */
  function setLevels(state, levels) {
    state.levels = levels || null;
  }

  // ---------------------------------------------------------------------------
  // MUTATIONS
  // Called by CanvasController in response to gestures. Fast + synchronous.
  // ---------------------------------------------------------------------------

  /** Add a disk to the canvas. Returns the new disk id. */
  function addDisk(state, sizeGB, protocol = 'SATA', pos = { x: 0, y: 0 }) {
    const id = nextId('disk');
    state.nodes.set(id, { kind: 'disk', id, sizeGB, protocol });
    state.positions.set(id, pos);
    state.roots.add(id);
    cpAutoRoute(state);   // the shared atom appears in the physical view too, routed
    return id;
  }

  /**
   * Group a list of disk ids into a new array (triggered by disk-onto-disk drop).
   * The array is born INCOMPLETE: segmentation and redundancy are null.
   * All members are removed from roots; the new array becomes a root.
   * Returns the new array id.
   */
  function group(state, memberIds) {
    const id = nextId('array');
    state.nodes.set(id, {
      kind:         'array',
      id,
      segmentation: null,
      redundancy:   null,
      algorithm:    null,
      members:      [...memberIds],
    });
    memberIds.forEach((mid) => state.roots.delete(mid));
    state.roots.add(id);
    return id;
  }

  /**
   * Add a disk to an existing array.
   * The disk is detached from any current parent array first — a disk can
   * only belong to one array at a time. Also removed from roots.
   */
  function addToArray(state, arrayId, diskId) {
    const arr = state.nodes.get(arrayId);
    if (!arr || arr.kind !== 'array') return;
    // Detach from current parent to prevent duplicate membership.
    for (const n of state.nodes.values()) {
      if (n.kind === 'array' && n.id !== arrayId) {
        const idx = n.members.indexOf(diskId);
        if (idx !== -1) n.members.splice(idx, 1);
      }
    }
    if (!arr.members.includes(diskId)) arr.members.push(diskId);
    state.roots.delete(diskId);
  }

  /**
   * The family of placement algorithms an array can carry: 'parity' (the
   * left/right × symmetric/asymmetric rotations), 'mirror' (near/far/offset,
   * flat RAID 10 / 1E only), or null. Mirrors layout.js and the UI's slot rule.
   */
  function _algorithmClass(arr) {
    if (arr.redundancy === 'parity1' || arr.redundancy === 'parity2') return 'parity';
    if (arr.segmentation === 'striped' && arr.redundancy === 'mirror') return 'mirror';
    return null;
  }

  /**
   * Apply an attribute change and drop the algorithm when it no longer belongs.
   * Found in-browser (2026-09-02): a mirror array with `near` turned into a parity
   * array still carried `near`, so the slot showed a layout that class does not
   * have and layout.js fell back on every evaluation. An algorithm is a choice
   * WITHIN a class; a change of class makes the old choice meaningless.
   */
  function _setAttribute(state, arrayId, key, value) {
    const arr = state.nodes.get(arrayId);
    if (!arr || arr.kind !== 'array') return;
    const before = _algorithmClass(arr);
    arr[key] = value;
    if (_algorithmClass(arr) !== before) arr.algorithm = null;
  }

  /** Set the segmentation of an array (drag segmentation chip onto array). */
  function setSegmentation(state, arrayId, value) {
    _setAttribute(state, arrayId, 'segmentation', value);
  }

  /** Set the redundancy of an array (drag redundancy chip onto array). */
  function setRedundancy(state, arrayId, value) {
    _setAttribute(state, arrayId, 'redundancy', value);
  }

  /**
   * Set the placement algorithm of an array (drag algorithm chip onto array).
   * Only verified algorithms are offered in the UI — this just stores the value.
   */
  function setAlgorithm(state, arrayId, value) {
    const arr = state.nodes.get(arrayId);
    if (arr && arr.kind === 'array') arr.algorithm = value;
  }

  /**
   * Detach a node id from every array that lists it as a member.
   * Prevents stale references: when a node is removed or dissolved, any parent
   * array must drop it from `members`, otherwise compile() will later try to
   * resolve a child id that no longer exists in `nodes` and silently return null
   * — which makes the whole build unrecognizable and unrepairable from the UI.
   */
  function _detachFromParents(state, id) {
    for (const n of state.nodes.values()) {
      if (n.kind === 'array') {
        const idx = n.members.indexOf(id);
        if (idx !== -1) n.members.splice(idx, 1);
      }
    }
  }

  /**
   * Dissolve an array: return its members to roots, remove the array node.
   * Used when the user "ungroups" an array.
   */
  function dissolve(state, arrayId) {
    const arr = state.nodes.get(arrayId);
    if (!arr || arr.kind !== 'array') return;
    arr.members.forEach((mid) => state.roots.add(mid));
    _detachFromParents(state, arrayId);   // drop this array from any parent's members
    state.nodes.delete(arrayId);
    state.roots.delete(arrayId);
    state.selected.delete(arrayId);
  }

  /**
   * Remove a node from the canvas entirely.
   * If the node is an array, its members are returned to roots first.
   */
  function remove(state, id) {
    const node = state.nodes.get(id);
    if (!node) return;
    if (node.kind === 'array') {
      node.members.forEach((mid) => state.roots.add(mid));
    } else if (node.kind === 'disk') {
      // The disk is the shared atom: drop its physical-view presence too.
      state.cpDiskPositions.delete(id);
      for (const [eid, e] of state.cpEdges) {
        if (e.fromNode === id || e.toNode === id) state.cpEdges.delete(eid);
      }
    }
    // Detach from any parent array — disk OR nested array — to avoid stale refs.
    _detachFromParents(state, id);
    state.nodes.delete(id);
    state.positions.delete(id);
    state.roots.delete(id);
    state.selected.delete(id);
  }

  /**
   * Update a disk's pixel position (fast path — called on every frame during drag).
   * This does NOT trigger evaluate(). The controller calls evaluate() on drop only.
   */
  function move(state, diskId, pos) {
    state.positions.set(diskId, pos);
  }

  // ---------------------------------------------------------------------------
  // AXIS A MUTATIONS — physical layer graph
  // ---------------------------------------------------------------------------

  /**
   * Add a physical component node. Returns the new node id. The id is not
   * checked against the catalogue here: a node of unknown type is inert (it has
   * no ports, so nothing can be wired to it) and the canvas refuses to place
   * one in the first place.
   */
  function cpAddNode(state, componentId, pos = { x: 0, y: 0 }) {
    const id = nextId('cpn');
    state.cpNodes.set(id, { id, componentId, pos });
    cpAutoRoute(state);   // it may be the piece the disks were waiting for
    return id;
  }

  /** Move a physical node (fast path). */
  function cpMoveNode(state, nodeId, pos) {
    const n = state.cpNodes.get(nodeId);
    if (n) n.pos = pos;
  }

  /** Remove a physical node and all its edges. */
  function cpRemoveNode(state, nodeId) {
    state.cpNodes.delete(nodeId);
    for (const [id, e] of state.cpEdges) {
      if (e.fromNode === nodeId || e.toNode === nodeId) state.cpEdges.delete(id);
    }
    cpAutoRoute(state);   // another acceptor may take the disks this one had
  }

  /**
   * May `fromNode.fromPort` be wired into `toNode.toPort` by hand?
   * Answers from the catalogue (port direction and the port-type relation) plus
   * the two rules that are the state's own: no self-loops, and disks are never
   * wired by hand — they route themselves by protocol (spec §2, v1).
   * The reason is for a developer or a test; the canvas simply does not draw
   * a wire it is told no about.
   */
  function cpCanConnect(state, fromNode, fromPort, toNode, toPort) {
    const no = (reason) => ({ ok: false, reason });
    if (!state.catalog) return no('no catalogue loaded — nothing can be wired yet');
    if (fromNode === toNode) return no('a component cannot be wired to itself');
    const from = state.cpNodes.get(fromNode);
    const to   = state.cpNodes.get(toNode);
    if (!from) return no(state.nodes.has(fromNode)
      ? 'disks are not wired by hand — they route by protocol'
      : `unknown node "${fromNode}"`);
    if (!to) return no(`unknown node "${toNode}"`);
    return state.catalog.canConnect(from.componentId, fromPort, to.componentId, toPort);
  }

  /**
   * Connect two physical nodes via their ports. Returns the edge id.
   * THROWS when cpCanConnect says no: a wire the catalogue forbids must never
   * exist in the state, in the browser (which asks first) or in a test (which
   * would otherwise assert on a canvas no player can draw —
   * tech-debt/headless-tests-bypass-port-validation.md).
   */
  function cpConnect(state, fromNode, fromPort, toNode, toPort) {
    const can = cpCanConnect(state, fromNode, fromPort, toNode, toPort);
    if (!can.ok) throw new Error(`cannot connect ${fromNode}.${fromPort} → ${toNode}.${toPort}: ${can.reason}`);
    return _addEdge(state, fromNode, fromPort, toNode, toPort, false);
  }

  function _addEdge(state, fromNode, fromPort, toNode, toPort, derived) {
    const id = nextId('cpe');
    state.cpEdges.set(id, { id, fromNode, fromPort, toNode, toPort, derived });
    return id;
  }

  /**
   * Remove a hand-drawn connection edge. Returns true when it did. A DERIVED
   * edge (disk → acceptor, created by cpAutoRoute) is domain truth, not a
   * drawing: it cannot be removed, and the call returns false.
   */
  function cpDisconnect(state, edgeId) {
    const e = state.cpEdges.get(edgeId);
    if (!e || e.derived) return false;
    state.cpEdges.delete(edgeId);
    return true;
  }

  /** Set a disk's position in the physical view (fast path, like move()). */
  function cpSetDiskPos(state, diskId, pos) {
    state.cpDiskPositions.set(diskId, pos);
  }

  /**
   * Auto-route every disk to a node that ACCEPTS its protocol, idempotently.
   * v1 has no manual disk-wiring (spec §2): which component takes a disk is
   * declared by the component itself (`accepts:` on an input port in
   * data/components/*.yaml — the backplane takes SATA/SAS, the PCIe bus takes
   * NVMe, and this file knows neither name). Re-asserts exactly one derived edge
   * disk → acceptor when one exists on the canvas, and clears stale disk edges
   * when it does not. Hand-drawn edges are never touched.
   *
   * Two acceptors on the canvas is an ambiguity the v1 model cannot express
   * (disks cannot be assigned by hand yet). It is resolved deterministically:
   * acceptor PRIORITY is catalogue order (a tri-mode controller listed before
   * the PCIe bus takes the NVMe disks whenever it is present), and among nodes
   * of the same kind the first placed wins; the verdict's "chain breaks"
   * diagnostics take over if that one is not cabled onward. Manual assignment
   * arrives with the backplane-diversity module (§9.4).
   */
  function cpAutoRoute(state) {
    for (const node of state.nodes.values()) {
      if (node.kind !== 'disk') continue;

      const diskEdges = Array.from(state.cpEdges.values())
        .filter((e) => e.fromNode === node.id);

      const target = _acceptorNodeFor(state, node.protocol);
      if (!target) {
        // Nothing on the canvas takes this protocol (or no catalogue yet) →
        // the disk routes nowhere; drop stale edges.
        diskEdges.forEach((e) => state.cpEdges.delete(e.id));
        continue;
      }

      const correct = diskEdges.find((e) => e.toNode === target.node.id && e.toPort === target.portId);
      diskEdges.forEach((e) => { if (e !== correct) state.cpEdges.delete(e.id); });
      if (!correct) _addEdge(state, node.id, 'out', target.node.id, target.portId, true);
    }
  }

  /**
   * The node a disk of `protocol` routes to, with the port: acceptors in
   * catalogue order, and for each the first node of that kind on the canvas.
   */
  function _acceptorNodeFor(state, protocol) {
    if (!state.catalog) return null;
    for (const a of state.catalog.acceptorsOf(protocol)) {
      for (const node of state.cpNodes.values())
        if (node.componentId === a.componentId) return { node, portId: a.portId };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // COMPILATION  canvas node → RaidModel node (headless, no DOM)
  // ---------------------------------------------------------------------------

  /**
   * Compile a canvas node (by id) to a RaidModel node tree.
   * Returns null if the node is incomplete (missing segmentation or redundancy,
   * empty members list, or any member fails to compile).
   */
  function compile(state, id) {
    const node = state.nodes.get(id);
    if (!node) return null;

    if (node.kind === 'disk') {
      return Model.disk(node.id, node.sizeGB, node.protocol);
    }

    if (!node.segmentation || !node.redundancy || node.members.length === 0) return null;

    const compiledMembers = node.members.map((mid) => compile(state, mid));
    if (compiledMembers.some((m) => m === null)) return null;

    // The canvas id rides along so a violation can name WHICH array it is about
    // (see Model.array). Without it every compiled array is indistinguishable.
    return Model.array(node.segmentation, node.redundancy, compiledMembers, node.algorithm, node.id);
  }

  // ---------------------------------------------------------------------------
  // EVALUATION — one call per gesture, drives all output panels
  // ---------------------------------------------------------------------------

  /**
   * Reconcile roots + members with ground truth before evaluating.
   *
   * Long sessions of group / dissolve / remove / re-add can leave the bookkeeping
   * inconsistent — a deleted node's id lingering in `roots`, a member reference to
   * a node that no longer exists, or a node that is both a root and a member. Any
   * of these inflates `roots.size`, so the recognizer reports "connect all elements"
   * even when the canvas visibly holds a single array. Rather than trust the
   * incremental bookkeeping after an arbitrary history, derive the truth here:
   *   1. drop member references to nodes that no longer exist;
   *   2. a node is a ROOT iff it exists and is not a member of any array.
   */
  function _reconcile(state) {
    // One pass over arrays, claiming each member for the FIRST array that holds it.
    // This simultaneously: drops dangling refs (member not in nodes), enforces
    // single membership (a node can't be a member of two arrays), and breaks any
    // cycle (a back-edge to an already-claimed node is dropped) — so the forest
    // that compile() later walks is always a finite, well-formed tree.
    const claimed = new Set();
    for (const n of state.nodes.values()) {
      if (n.kind !== 'array') continue;
      n.members = n.members.filter((mid) => {
        if (!state.nodes.has(mid) || claimed.has(mid)) return false;
        claimed.add(mid);
        return true;
      });
    }
    // A node is a ROOT iff it exists and is not claimed as anyone's member.
    state.roots = new Set(
      Array.from(state.nodes.keys()).filter((id) => !claimed.has(id))
    );
  }

  /**
   * Compile the canvas state and run the full analysis + placement pipeline.
   *
   * Returns:
   *   tree       — compiled RaidModel node, or null if the build is incomplete
   *   analysis   — RaidModel.analyze() result, or null
   *   placement  — RaidLayout.computePlacement() result, or null
   *   rootCount  — number of top-level nodes (1 = evaluable, >1 = disconnected build)
   *   incomplete — true if any array is missing segmentation, redundancy, or members
   *   firstIssue — first actionable hint for the help message, or null if build is valid
   */
  function evaluate(state, opts = {}) {
    _reconcile(state);   // tolerate any group/dissolve/remove/re-add history
    const rootIds   = Array.from(state.roots);
    const rootCount = rootIds.length;

    const incomplete = Array.from(state.nodes.values()).some(
      (n) => n.kind === 'array' && (!n.segmentation || !n.redundancy || n.members.length === 0)
    );

    const firstIssue = _firstIssue(state, rootCount);
    const noViolations = { hard: [], soft: [] };   // §6 checks run only on a complete tree

    if (rootCount !== 1) {
      return { tree: null, analysis: null, placement: null, rootCount, incomplete, firstIssue,
               violations: noViolations };
    }

    const rootId   = rootIds[0];
    const rootNode = state.nodes.get(rootId);

    if (rootNode.kind === 'disk') {
      return { tree: null, analysis: null, placement: null, rootCount, incomplete,
               firstIssue: firstIssue ?? 'Group disks into an array to build a RAID.',
               violations: noViolations };
    }

    const tree = compile(state, rootId);
    if (!tree) {
      return { tree: null, analysis: null, placement: null, rootCount, incomplete, firstIssue,
               violations: noViolations };
    }

    const analysis  = Model.analyze(tree, state.levels);
    const placement = Layout.computePlacement(tree, opts);

    // Axis A: the disks are already routed (routing is a mutation, see
    // cpAutoRoute), so the recognizer sees the graph exactly as the canvas
    // draws it. Nothing here writes to the state.
    const disks = _diskIds(state);
    const cp    = Physical.recognize(state.cpNodes, state.cpEdges, disks, state.catalog);

    // §6 constraints: a pure module, fed a DERIVED physical view, only ATTACHES
    // its output here (same loose bolt-on pattern as the physical recognizer).
    const violations = Validator.validate(tree,
      Physical.buildView(state.cpNodes, state.cpEdges, disks, cp, state.catalog),
      { levels: state.levels });

    return {
      tree, analysis, placement, rootCount, incomplete, firstIssue: null,
      raidType:            cp.raidType,
      os:                  cp.os,
      controlPathComplete: cp.complete,
      controlPathIssue:    cp.issue,
      controlPathReason:   cp.reason ?? null,
      engineNodeId:        cp.engineNodeId ?? null,
      violations,
    };
  }

  /**
   * The disks, as the control-path graph knows them: they live on axis B and
   * appear in cpEdges by disk id only, so the recognizer has to be told which
   * endpoints are sources. Protocol rides along because the HBA requirement
   * (below) is scoped to SATA/SAS — NVMe disks reach the PCIe bus directly.
   */
  function _diskIds(state) {
    return Array.from(state.nodes.values())
      .filter((n) => n.kind === 'disk')
      .map((n) => ({ id: n.id, protocol: n.protocol }));
  }

  // Derive the first actionable hint from the current state.
  // Ordered from most granular (per-array) to most structural (connectivity).
  function _firstIssue(state, rootCount) {
    if (state.nodes.size === 0)
      return 'Drag a disk onto the canvas to start.';

    const arrays = Array.from(state.nodes.values()).filter((n) => n.kind === 'array');
    const disks  = Array.from(state.nodes.values()).filter((n) => n.kind === 'disk');

    if (arrays.length === 0 && disks.length > 0)
      return 'Drag one disk onto another to create an array.';

    for (const arr of arrays) {
      if (arr.members.length < 2) {
        // An array of arrays is a nested level (RAID 10/50/60): it needs spans,
        // not bare disks. Word the hint for what actually belongs here.
        const wantsSpans = arr.members.some((mid) => state.nodes.get(mid)?.kind === 'array');
        return wantsSpans ? 'A nested array needs at least 2 spans.'
                          : 'An array needs at least 2 disks.';
      }
      if (!arr.segmentation)       return 'Drop a segmentation type onto the array.';
      if (!arr.redundancy)         return 'Drop a redundancy type onto the array.';
    }

    if (rootCount > 1)
      return 'Connect all elements into a single array.';

    return null;
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  const CanvasState = {
    createState, reset, setCatalog, setLevels,
    // Axis B
    addDisk, group, addToArray,
    setSegmentation, setRedundancy, setAlgorithm,
    dissolve, remove, move,
    compile,
    // Axis A
    cpAddNode, cpMoveNode, cpRemoveNode, cpCanConnect, cpConnect, cpDisconnect,
    cpSetDiskPos, cpAutoRoute,
    // pipeline
    evaluate,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CanvasState;
  else root.CanvasState = CanvasState;

})(typeof globalThis !== 'undefined' ? globalThis : this);
