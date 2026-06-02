/**
 * canvas-state.js — RAID Sandbox: mutable canvas state + evaluation pipeline (Phase 3).
 *
 * Holds the user's in-progress build as a forest of canvas nodes (disks and arrays).
 * Exposes atomic mutations (called by the drag-and-drop controller) and evaluate() —
 * the single call that compiles the forest into a model.js tree and runs the pipeline:
 *   compile → RaidModel.analyze → RaidLayout.computePlacement
 *
 * Positions are kept in a separate map so the drag fast-path (requestAnimationFrame)
 * can update pixel coordinates without touching domain state or triggering evaluate().
 * evaluate() is called once per gesture (on drop), never during drag.
 *
 * Depends on: model.js (RaidModel), layout.js (RaidLayout)
 *
 *   CanvasState.createState()                             → state
 *   CanvasState.addDisk(state, sizeGB, protocol, pos)     → id
 *   CanvasState.group(state, memberIds)                   → id
 *   CanvasState.addToArray(state, arrayId, diskId)        → void
 *   CanvasState.setSegmentation(state, arrayId, value)    → void
 *   CanvasState.setRedundancy(state, arrayId, value)      → void
 *   CanvasState.setAlgorithm(state, arrayId, value)       → void
 *   CanvasState.dissolve(state, arrayId)                  → void
 *   CanvasState.remove(state, id)                         → void
 *   CanvasState.move(state, diskId, pos)                  → void  (fast path)
 *   CanvasState.evaluate(state)                           → EvalResult
 */

(function (root) {
  'use strict';

  const Model  = (typeof require !== 'undefined') ? require('./model.js')  : root.RaidModel;
  const Layout = (typeof require !== 'undefined') ? require('./layout.js') : root.RaidLayout;

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
   */
  function createState() {
    return {
      nodes:     new Map(),
      roots:     new Set(),
      positions: new Map(),
      selected:  new Set(),
    };
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
   * Add a disk to an existing array (triggered by disk-onto-array drop).
   * The disk is removed from roots.
   */
  function addToArray(state, arrayId, diskId) {
    const arr = state.nodes.get(arrayId);
    if (!arr || arr.kind !== 'array') return;
    if (!arr.members.includes(diskId)) arr.members.push(diskId);
    state.roots.delete(diskId);
  }

  /** Set the segmentation of an array (drag segmentation chip onto array). */
  function setSegmentation(state, arrayId, value) {
    const arr = state.nodes.get(arrayId);
    if (arr && arr.kind === 'array') arr.segmentation = value;
  }

  /** Set the redundancy of an array (drag redundancy chip onto array). */
  function setRedundancy(state, arrayId, value) {
    const arr = state.nodes.get(arrayId);
    if (arr && arr.kind === 'array') arr.redundancy = value;
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
   * Dissolve an array: return its members to roots, remove the array node.
   * Used when the user "ungroups" an array.
   */
  function dissolve(state, arrayId) {
    const arr = state.nodes.get(arrayId);
    if (!arr || arr.kind !== 'array') return;
    arr.members.forEach((mid) => state.roots.add(mid));
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
    if (node.kind === 'array') node.members.forEach((mid) => state.roots.add(mid));
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

    return Model.array(node.segmentation, node.redundancy, compiledMembers, node.algorithm);
  }

  // ---------------------------------------------------------------------------
  // EVALUATION — one call per gesture, drives all output panels
  // ---------------------------------------------------------------------------

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
    const rootIds   = Array.from(state.roots);
    const rootCount = rootIds.length;

    const incomplete = Array.from(state.nodes.values()).some(
      (n) => n.kind === 'array' && (!n.segmentation || !n.redundancy || n.members.length === 0)
    );

    const firstIssue = _firstIssue(state, rootCount);

    if (rootCount !== 1) {
      return { tree: null, analysis: null, placement: null, rootCount, incomplete, firstIssue };
    }

    const rootId   = rootIds[0];
    const rootNode = state.nodes.get(rootId);

    if (rootNode.kind === 'disk') {
      return { tree: null, analysis: null, placement: null, rootCount, incomplete,
               firstIssue: firstIssue ?? 'Group disks into an array to build a RAID.' };
    }

    const tree = compile(state, rootId);
    if (!tree) {
      return { tree: null, analysis: null, placement: null, rootCount, incomplete, firstIssue };
    }

    const analysis  = Model.analyze(tree);
    const placement = Layout.computePlacement(tree, opts);

    return { tree, analysis, placement, rootCount, incomplete, firstIssue: null };
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
      if (arr.members.length < 2)  return 'An array needs at least 2 disks.';
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
    createState,
    addDisk, group, addToArray,
    setSegmentation, setRedundancy, setAlgorithm,
    dissolve, remove, move,
    compile, evaluate,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CanvasState;
  else root.CanvasState = CanvasState;

})(typeof globalThis !== 'undefined' ? globalThis : this);
