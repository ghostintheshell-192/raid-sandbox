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
 * Depends on: model.js (RaidModel), layout.js (RaidLayout), graph.js (RaidGraph)
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
  const Graph     = (typeof require !== 'undefined') ? require('../engine/graph.js')     : root.RaidGraph;

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

    const analysis  = Model.analyze(tree);
    const placement = Layout.computePlacement(tree, opts);
    // Disk edges are protocol-derived, not player-drawn, so they are domain
    // truth — but the only caller was the physical view's render(). Now that the
    // verdict is a walk from the disks, a recognizer that ran before a render
    // would see a graph with no sources at all. Idempotent by construction.
    cpAutoRoute(state);
    const cp = _recognizePhysicalLayer(state.cpNodes, state.cpEdges, _diskIds(state));

    // §6 constraints: a pure module, fed a DERIVED physical view, only ATTACHES
    // its output here (same loose bolt-on pattern as _recognizePhysicalLayer).
    const violations = Validator.validate(tree, _buildPhysicalAdapter(state, cp));

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
   * endpoints are sources.
   */
  function _diskIds(state) {
    return Array.from(state.nodes.values()).filter((n) => n.kind === 'disk').map((n) => n.id);
  }

  /**
   * Build the derived physical view the validator consumes (never the raw cp* Maps).
   *   engineCount — RAID-engine-bearing nodes (controller-hw or raid-engine); >1 is illegal
   *   diskRoutes  — each disk's protocol + the component it actually wires into
   */
  function _buildPhysicalAdapter(state, cp) {
    const engineCount = Array.from(state.cpNodes.values())
      .filter((n) => n.componentId === 'controller-hw' || n.componentId === 'raid-engine').length;

    const diskRoutes = [];
    for (const node of state.nodes.values()) {
      if (node.kind !== 'disk') continue;
      const edge   = Array.from(state.cpEdges.values()).find((e) => e.fromNode === node.id);
      const target = edge ? (state.cpNodes.get(edge.toNode)?.componentId ?? null) : null;
      diskRoutes.push({ id: node.id, protocol: node.protocol, target });
    }
    return { raidType: cp.raidType, os: cp.os, engineCount, diskRoutes };
  }

  /**
   * Derive hardware/fake/software from the physical layer graph.
   *
   * Rules (from component YAML raidEnginePosition fields):
   *   A node with componentId 'controller-hw'              → Hardware RAID
   *   A node with componentId 'raid-engine' AND an OS node → engine position
   *     determines fake (between hba and cpu) vs software (in/after os)
   *
   * The verdict is a claim about a PATH, so it is derived by walking one
   * (`engine/graph.js`). The MVP shortcut — inspect which component types are
   * present, plus one outgoing edge from the engine — declared a type for
   * builds where no path existed: a floating HBA still counted as an HBA, and
   * disks that reached nothing still counted as disks. A component is on the
   * path here only if a disk reaches it AND it reaches an OS.
   *
   * What is NOT re-derived here: the fake-vs-software discriminant is still the
   * direct engine→OS edge. Replacing it with the two-threshold rule (PCIe, OS)
   * is the derived-controller work and belongs to its own branch.
   *
   * Every determined verdict also carries `reason` and `engineNodeId`. The panel
   * used to show the verdict alone, which hides the one insight axis A exists to
   * teach (§2): hardware/software/fake are the SAME path with the engine in a
   * different place. The explanation belongs here, with the derivation — a view
   * that re-derives it could disagree with the badge above it.
   */
  function _recognizePhysicalLayer(cpNodes, cpEdges, diskIds) {
    const g     = Graph.build(cpNodes, cpEdges);
    const disks = diskIds || [];

    const osIds  = Graph.nodesWith(g, 'os-linux').concat(Graph.nodesWith(g, 'os-windows'));
    const os     = osIds.length ? g.nodes.get(osIds[0]).componentId : null;
    const osName = os === 'os-windows' ? 'Windows' : 'Linux';

    const undetermined = (issue) => ({ raidType: null, os: null, complete: false, issue });

    // The two halves of "on the path", kept separate because they fail with
    // different advice: nothing feeds this, versus this feeds nothing.
    const fedByDisk = (id) => disks.some((d) => Graph.reaches(g, d, id));
    const reachesOS = (id) => osIds.some((o) => Graph.reaches(g, id, o));
    const onPath    = (id) => fedByDisk(id) && reachesOS(id);

    const ctrlIds   = Graph.nodesWith(g, 'controller-hw');
    const engineIds = Graph.nodesWith(g, 'raid-engine');

    /**
     * Shared gate for both engine-bearing components: the same four questions,
     * asked in the order the player can act on them. Returns an issue string,
     * or null when the node genuinely sits on a disks→OS path.
     */
    function pathIssueFor(id, label) {
      if (g.out.get(id).length === 0)
        return `Connect the ${label} output — until it is wired, nothing can be `
             + 'said about which RAID you are building.';
      if (!os)
        return 'Add an OS node to complete the path.';
      if (!fedByDisk(id)) {
        // Two different builds land here and they need different advice. Nothing
        // wired at all is "start at the disks"; disks wired into a chain that
        // dead-ends is the opposite problem, and telling that player to start at
        // the disks describes something they can see they already did. Found
        // in-browser with two backplanes, the disks auto-routed to the one that
        // was not cabled onward.
        const anyDiskWired = disks.some((d) => (g.out.get(d) || []).length > 0);
        return anyDiskWired
          ? `The disks are wired, but the chain breaks before the ${label} — `
            + 'follow the cables forward from them to find the gap.'
          : `No disk reaches the ${label} yet — the path has to start at the disks.`;
      }
      if (!reachesOS(id))
        return `The ${label} does not reach the OS — the path stops before it.`;
      return null;
    }

    // A controller dropped on the canvas is not yet ON the path. Presence alone
    // used to be enough to declare hardware RAID — the verdict came out before a
    // single cable existed.
    if (ctrlIds.length) {
      const ctrlId = ctrlIds.find(onPath) ?? ctrlIds[0];
      const issue  = pathIssueFor(ctrlId, 'Controller HW');
      if (issue) return undetermined(issue);

      return { raidType: 'hardware', os: null, complete: true, issue: null,
               engineNodeId: ctrlId,
               // Names the piece exactly as the canvas labels it. A sentence that
               // says "the controller card" points at something the player cannot
               // find: that name exists nowhere in the game.
               reason: 'The RAID engine is inside the Controller HW — it sits before the '
                     + 'PCIe bus, builds the array itself, and the OS sees one virtual drive.' };
    }

    if (engineIds.length) {
      const engineId = engineIds.find(onPath) ?? engineIds[0];
      const issue    = pathIssueFor(engineId, 'RAID Engine');
      if (issue) return undetermined(issue);

      // The HBA must be BETWEEN the disks and the engine, not merely present.
      // A card lying unwired on the canvas used to satisfy this branch.
      const hbas      = Graph.nodesWith(g, 'hba');
      const hbaOnPath = hbas.some((h) => fedByDisk(h) && Graph.reaches(g, h, engineId));
      if (!hbaOnPath) {
        // An HBA wired downstream of the engine is present AND connected, so
        // "without it" would be describing a canvas the player is not looking at.
        const hbaIsDownstream = hbas.some((h) => Graph.reaches(g, engineId, h));
        return undetermined(hbaIsDownstream
          ? 'The HBA sits after the RAID Engine — it is what carries the disks TO the '
          + 'engine, so it belongs between them.'
          : 'Route the disks through an HBA before the RAID Engine — '
          + 'without it nothing carries them to the engine.');
      }

      // Software RAID: engine output goes directly to an OS node.
      const connectsToOS = (g.out.get(engineId) || []).some((toId) => osIds.includes(toId));
      if (connectsToOS) return { raidType: 'software', os, complete: true, issue: null,
        engineNodeId: engineId,
        reason: `The RAID engine sits in the OS — ${osName} computes the layout itself, `
              + 'with no RAID hardware in the path.' };

      // Fake RAID: engine output goes to CPU or PCIe (engine sits before CPU).
      return { raidType: 'fake', os, complete: true, issue: null,
        engineNodeId: engineId,
        reason: 'The RAID engine sits before the CPU, not in the OS — but it is a chip, '
              + 'not a full controller, so the CPU still does the real work.' };
    }

    if (Graph.nodesWith(g, 'hba').length === 0)
      return undetermined('Add a controller (HBA or Controller HW) to the physical path.');
    if (!os)
      return undetermined('Add an OS node to complete the path.');
    return undetermined('Add a RAID Engine to the path — its position determines the RAID type.');
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
    createState, reset,
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
