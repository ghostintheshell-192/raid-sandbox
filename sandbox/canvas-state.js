/**
 * canvas-state.js — RAID Sandbox: mutable canvas state + evaluation pipeline.
 *
 * Two orthogonal axes (spec §2):
 *   Axis B (data layout) — disk/array tree; recognizer derives the RAID level.
 *   Axis A (control path) — the physical path disks→backplane→controller→CPU→OS;
 *                           engine position derives hardware/fake/software RAID.
 *
 * Positions are kept in a separate map so the drag fast-path (requestAnimationFrame)
 * can update pixel coordinates without touching domain state or triggering evaluate().
 * evaluate() is called once per gesture (on drop), never during drag.
 *
 * Depends on: model.js (RaidModel), layout.js (RaidLayout)
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
    if (node.kind === 'array') {
      node.members.forEach((mid) => state.roots.add(mid));
    } else if (node.kind === 'disk') {
      // Remove from any parent array's members list to avoid stale references.
      for (const n of state.nodes.values()) {
        if (n.kind === 'array') {
          const idx = n.members.indexOf(id);
          if (idx !== -1) n.members.splice(idx, 1);
        }
      }
      // The disk is the shared atom: drop its physical-view presence too.
      state.cpDiskPositions.delete(id);
      for (const [eid, e] of state.cpEdges) {
        if (e.fromNode === id || e.toNode === id) state.cpEdges.delete(eid);
      }
    }
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

  /** Add a physical component node. Returns the new node id. */
  function cpAddNode(state, componentId, pos = { x: 0, y: 0 }) {
    const id = nextId('cpn');
    state.cpNodes.set(id, { id, componentId, pos });
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
  }

  /** Connect two physical nodes via their ports. Returns edge id. */
  function cpConnect(state, fromNode, fromPort, toNode, toPort) {
    const id = nextId('cpe');
    state.cpEdges.set(id, { id, fromNode, fromPort, toNode, toPort });
    return id;
  }

  /** Remove a connection edge. */
  function cpDisconnect(state, edgeId) {
    state.cpEdges.delete(edgeId);
  }

  /** Set a disk's position in the physical view (fast path, like move()). */
  function cpSetDiskPos(state, diskId, pos) {
    state.cpDiskPositions.set(diskId, pos);
  }

  /**
   * The physical component a disk routes into, by protocol (spec §2, v1 rule):
   *   SATA/SAS → backplane · NVMe → PCIe bus (bypasses the backplane).
   */
  function _diskTargetComponent(protocol) {
    return protocol === 'NVMe' ? 'pcie' : 'backplane';
  }

  /**
   * Auto-route every disk to its protocol-determined target node, idempotently.
   * v1 has no manual disk-wiring: the disk's protocol decides where it connects
   * (NVMe-bypass made visible). Re-asserts exactly one edge disk→target when the
   * target exists, and clears stale disk edges when it does not. Components wire
   * to each other manually as before — this only manages disk→target edges.
   */
  function cpAutoRoute(state) {
    for (const node of state.nodes.values()) {
      if (node.kind !== 'disk') continue;

      const targetComp = _diskTargetComponent(node.protocol);
      const targetNode = Array.from(state.cpNodes.values())
        .find((n) => n.componentId === targetComp);

      const diskEdges = Array.from(state.cpEdges.values())
        .filter((e) => e.fromNode === node.id);

      if (!targetNode) {
        // No target on the canvas yet → the disk routes nowhere; drop stale edges.
        diskEdges.forEach((e) => state.cpEdges.delete(e.id));
        continue;
      }

      const correct = diskEdges.find((e) => e.toNode === targetNode.id);
      // Remove any edge pointing at the wrong target (e.g. protocol changed).
      diskEdges.forEach((e) => { if (e !== correct) state.cpEdges.delete(e.id); });
      if (!correct) cpConnect(state, node.id, 'out', targetNode.id, 'in');
    }
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
    const cp = _recognizePhysicalLayer(state.cpNodes, state.cpEdges);

    return {
      tree, analysis, placement, rootCount, incomplete, firstIssue: null,
      raidType:            cp.raidType,
      os:                  cp.os,
      controlPathComplete: cp.complete,
      controlPathIssue:    cp.issue,
    };
  }

  /**
   * Derive hardware/fake/software from the physical layer graph.
   *
   * Rules (from component YAML raidEnginePosition fields):
   *   A node with componentId 'controller-hw'              → Hardware RAID
   *   A node with componentId 'raid-engine' AND an OS node → engine position
   *     determines fake (between hba and cpu) vs software (in/after os)
   *
   * For MVP: inspect the set of component types present in the graph.
   * Full graph-traversal recognizer deferred to when constraint engine lands.
   */
  function _recognizePhysicalLayer(cpNodes, cpEdges) {
    const components = new Set(Array.from(cpNodes.values()).map(n => n.componentId));
    const osNode = Array.from(cpNodes.values()).find(n => n.componentId === 'os-linux' || n.componentId === 'os-windows');
    const os = osNode ? osNode.componentId : null;

    if (components.has('controller-hw'))
      return { raidType: 'hardware', os: null, complete: true, issue: null };

    const hasEngine = components.has('raid-engine');
    const hasHBA    = components.has('hba');
    const hasOS     = !!os;

    if (hasHBA && hasEngine && hasOS) {
      const engineNode = Array.from(cpNodes.values()).find(n => n.componentId === 'raid-engine');
      const engineId   = engineNode ? engineNode.id : null;

      // Engine must be connected on its output side to know its position.
      // Check ALL outgoing edges from the engine (with 'any' ports the user
      // could have made multiple connections; we look for the most specific one).
      const engineOutEdges = engineId
        ? Array.from(cpEdges.values()).filter(e => e.fromNode === engineId)
        : [];

      if (engineOutEdges.length === 0)
        return { raidType: null, os: null, complete: false,
                 issue: 'Connect the RAID Engine output — its position determines the RAID type.' };

      // Software RAID: engine output goes directly to an OS node.
      const connectsToOS = engineOutEdges.some(e => {
        const c = cpNodes.get(e.toNode)?.componentId;
        return c === 'os-linux' || c === 'os-windows';
      });
      if (connectsToOS) return { raidType: 'software', os, complete: true, issue: null };

      // Fake RAID: engine output goes to CPU or PCIe (engine sits before CPU).
      return { raidType: 'fake', os, complete: true, issue: null };
    }

    if (!hasHBA && !components.has('controller-hw'))
      return { raidType: null, os: null, complete: false,
               issue: 'Add a controller (HBA or Controller HW) to the physical path.' };
    if (!hasEngine && !components.has('controller-hw'))
      return { raidType: null, os: null, complete: false,
               issue: 'Add a RAID Engine to the path — its position determines the RAID type.' };
    if (!hasOS)
      return { raidType: null, os: null, complete: false,
               issue: 'Add an OS node to complete the path.' };

    return { raidType: null, os: null, complete: false, issue: 'Connect all nodes to complete the path.' };
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
    // Axis B
    addDisk, group, addToArray,
    setSegmentation, setRedundancy, setAlgorithm,
    dissolve, remove, move,
    compile,
    // Axis A
    cpAddNode, cpMoveNode, cpRemoveNode, cpConnect, cpDisconnect,
    cpSetDiskPos, cpAutoRoute,
    // pipeline
    evaluate,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CanvasState;
  else root.CanvasState = CanvasState;

})(typeof globalThis !== 'undefined' ? globalThis : this);
