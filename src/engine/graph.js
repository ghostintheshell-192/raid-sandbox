// @ts-check
/**
 * graph.js — RAID Sandbox: the control-path graph, as a graph (Phase 5, Stage E).
 *
 * PURE and headless: takes the two raw canvas maps, returns an adjacency index
 * and answers reachability questions over it. No DOM, no canvas state, no
 * knowledge of what a backplane or an OS *means* — that reading belongs to the
 * recognizer in canvas-state.js, which asks the questions and passes the
 * ANSWERS on. Nothing downstream of the recognizer ever sees a raw graph.
 *
 *   build(cpNodes, cpEdges)          → Graph
 *   reachableFrom(g, id, opts)       → Set<nodeId>
 *   reaches(g, from, to, opts)       → boolean
 *   nodesWith(g, componentId)        → nodeId[]
 *
 * Deliberately NOT here: shortest paths, cycle enumeration, topological order,
 * any notion of "correct" component order. The first thing this module is asked
 * is "do the disks reach the OS", and it is sized for that question.
 *
 * Three properties of THIS graph shape the code, none of them incidental:
 *
 *  1. Edges are always out→in. `physical-controller.js` only ever starts a
 *     connection on an output port and only ever completes it on an input port,
 *     so `fromNode` is upstream and `toNode` downstream, always. Direction here
 *     is data flow (disks → OS), not cable topology.
 *  2. Cycles are constructible. The RAID Engine's ports are typed `any`, so the
 *     player can wire it back into a node that already feeds it. Every walk
 *     therefore carries its visited set from the first step, not as an
 *     afterthought.
 *  3. Node ids come from two different maps. Disks live in `state.nodes`
 *     (axis B) and are referenced in `cpEdges` by their disk id; they are not
 *     in `cpNodes`. Any edge endpoint missing from `cpNodes` is materialised
 *     here as a node with `componentId: null` — an endpoint that exists but
 *     carries no physical type.
 */
(function (/** @type {any} */ root) {   // the UMD host: window, or Node's global
  'use strict';

  // ---------------------------------------------------------------------------
  // BUILD
  // ---------------------------------------------------------------------------

  /**
   * Index nodes and edges into forward + reverse adjacency.
   *
   * The reverse index is not speculative: "which disks feed this engine" and
   * "what sits upstream of the OS" are the same walk in the other direction,
   * and building it costs one more push per edge.
   *
   * @param {Map<string, CpNode> | null | undefined} cpNodes  id → { id, componentId, ... }
   * @param {Map<string, CpEdge> | null | undefined} cpEdges  id → { id, fromNode, toNode, ... }
   * @returns {Graph}
   */
  function build(cpNodes, cpEdges) {
    const nodes = new Map();
    const out   = new Map();
    const inn   = new Map();

    const touch = (id, componentId) => {
      if (!nodes.has(id)) {
        nodes.set(id, { id, componentId: componentId ?? null });
        out.set(id, []);
        inn.set(id, []);
      }
      return nodes.get(id);
    };

    for (const n of (cpNodes ? cpNodes.values() : [])) touch(n.id, n.componentId);

    for (const e of (cpEdges ? cpEdges.values() : [])) {
      // Endpoints unknown to cpNodes are disks (property 3 above), not errors.
      touch(e.fromNode, null);
      touch(e.toNode, null);
      out.get(e.fromNode).push(e.toNode);
      inn.get(e.toNode).push(e.fromNode);
    }

    return { nodes, out, in: inn };
  }

  // ---------------------------------------------------------------------------
  // TRAVERSAL
  // ---------------------------------------------------------------------------

  /**
   * Every node reachable from `startId` by following one or more edges.
   *
   * The start is NOT in the result — unless a cycle leads back to it, which is
   * exactly what the caller wants to know when it happens. `opts.direction`
   * is 'out' (downstream, the default) or 'in' (upstream).
   *
   * @param {Graph} g @param {string} startId @param {{ direction?: 'out' | 'in' }} [opts]
   * @returns {Set<string>} empty when the start is unknown to the graph
   */
  function reachableFrom(g, startId, opts) {
    const adj = (opts && opts.direction === 'in') ? g.in : g.out;
    const seen = new Set();
    if (!adj.has(startId)) return seen;

    const queue = adj.get(startId).slice();
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id)) continue;   // the player can build cycles — property 2
      seen.add(id);
      const next = adj.get(id);
      if (next) queue.push(...next);
    }
    return seen;
  }

  /**
   * Does a directed path of one or more edges run from `fromId` to `toId`?
   * @param {Graph} g @param {string} fromId @param {string} toId @param {{ direction?: 'out' | 'in' }} [opts]
   * @returns {boolean}
   */
  function reaches(g, fromId, toId, opts) {
    return reachableFrom(g, fromId, opts).has(toId);
  }

  // ---------------------------------------------------------------------------
  // LOOKUP
  // ---------------------------------------------------------------------------

  /**
   * Every node of a given component type — ALL of them, in insertion order.
   *
   * Callers historically reached for `.find()` and silently took the first
   * match; with two backplanes on the canvas that is a coin toss. Returning the
   * list makes the ambiguity the caller's to handle instead of hiding it.
   * @param {Graph} g @param {string} componentId
   * @returns {string[]}
   */
  function nodesWith(g, componentId) {
    const ids = [];
    for (const n of g.nodes.values()) if (n.componentId === componentId) ids.push(n.id);
    return ids;
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  const RaidGraph = { build, reachableFrom, reaches, nodesWith };

  if (typeof module !== 'undefined' && module.exports) module.exports = RaidGraph;
  else root.RaidGraph = RaidGraph;

})(typeof globalThis !== 'undefined' ? globalThis : this);
