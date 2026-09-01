/**
 * physical.js — RAID Sandbox: the physical-layer recognizer (axis A, ADR-001).
 *
 * PURE and headless. Takes the two raw control-path maps, the disk list and the
 * component CATALOGUE, and returns the verdict — hardware / fake / software —
 * with the reason, or the one issue the player can act on next.
 *
 * What it knows about the domain by name: nothing. Every component-specific
 * fact is read off the catalogue (data/components/*.yaml, indexed by
 * engine/catalog.js):
 *
 *   - which objects are RAID engines and what verdict each yields — any
 *     non-sink component that declares a `verdict:` block (raidType + reason);
 *     when several kinds sit on the canvas, the first in catalogue order wins;
 *   - where the path ends — the `roles.sink` capability in index.yaml (the OS),
 *     with the label and article the diagnostics name it by;
 *   - how a piece is called in a message — its ui.label (+ badge);
 *   - where a disk goes — the components that `accept` its protocol;
 *   - which verdicts are still OPEN on a half-built canvas — an engine object
 *     whose input port could still be fed by a wired chain's loose end. While
 *     any is, the recognizer says nothing rather than presume the player's
 *     direction (the "derive, don't select" principle of axis B, on axis A).
 *
 * The old HBA gate ("SATA/SAS disks need protocol translation before the
 * engine") is not here any more: with typed ports nothing but a backplane
 * outputs `routing`, and only a translator consumes it, so the port relation
 * enforces it structurally — a wire that skipped the HBA cannot be drawn.
 *
 * Every determined verdict carries `reason` and `engineNodeId`: the panel used
 * to show the verdict alone, which hides the one insight axis A exists to teach
 * (§2) — hardware/software/fake are the SAME path, told apart by which engine
 * object sits on it, or none. The explanation belongs with the derivation.
 *
 *   recognize(cpNodes, cpEdges, disks, catalog)
 *     → { raidType, os, complete, issue, reason, engineNodeId }
 *   buildView(cpNodes, cpEdges, disks, cp, catalog)
 *     → { raidType, os, engineCount, diskRoutes }   // the PhysicalView the validator consumes
 *
 * `disks` is [{ id, protocol }]: disks live on axis B and appear in cpEdges by
 * id only, so the recognizer has to be told which endpoints are sources.
 *
 * Depends on: graph.js (RaidGraph).
 */

(function (root) {
  'use strict';

  const Graph = (typeof require !== 'undefined') ? require('./graph.js') : root.RaidGraph;

  // ---------------------------------------------------------------------------
  // CATALOGUE READERS — the only place the domain's shape is interpreted
  // ---------------------------------------------------------------------------

  /** "RAID Engine (RoC)": the label the palette and the canvas show. */
  function displayName(def) {
    const ui    = def.ui || {};
    const label = ui.label || def.name || def.id;
    return ui.badge ? `${label} (${ui.badge})` : label;
  }

  function sinkRole(catalog) {
    const sink = (catalog.roles || {}).sink;
    if (!sink || !sink.capability)
      throw new Error('catalog: roles.sink.capability is required — the recognizer needs to know where the path ends');
    return { capability: sink.capability, label: sink.label || 'end of the path', article: sink.article || 'a' };
  }

  const isSink = (def, sink) => (def.provides || []).includes(sink.capability);

  /** Engine objects: non-sink components that declare a verdict, in catalogue order. */
  function engineDefs(catalog, sink) {
    return catalog.ids().map((id) => catalog.get(id))
      .filter((def) => def.verdict && !isSink(def, sink));
  }

  const unique = (xs) => Array.from(new Set(xs));

  // ---------------------------------------------------------------------------
  // RECOGNIZE
  // ---------------------------------------------------------------------------

  function recognize(cpNodes, cpEdges, disks, catalog) {
    disks = disks || [];
    const undetermined = (issue) =>
      ({ raidType: null, os: null, complete: false, issue, reason: null, engineNodeId: null });

    if (!catalog)
      return undetermined('No component catalogue is loaded — the physical layer cannot be read yet.');

    const sink    = sinkRole(catalog);
    const engines = engineDefs(catalog, sink);
    const g       = Graph.build(cpNodes, cpEdges);
    const defOf   = (nodeId) => {
      const n = g.nodes.get(nodeId);
      return n && n.componentId ? catalog.get(n.componentId) : null;
    };

    const sinkIds = Array.from(g.nodes.values())
      .filter((n) => { const d = defOf(n.id); return d && isSink(d, sink); })
      .map((n) => n.id);
    const os = sinkIds.length ? g.nodes.get(sinkIds[0]).componentId : null;

    // The two halves of "on the path", kept separate because they fail with
    // different advice: nothing feeds this, versus this feeds nothing.
    const fedByDisk   = (id) => disks.some((d) => Graph.reaches(g, d.id, id));
    const reachesSink = (id) => sinkIds.some((o) => Graph.reaches(g, id, o));
    const onPath      = (id) => fedByDisk(id) && reachesSink(id);
    const anyDiskWired = disks.some((d) => (g.out.get(d.id) || []).length > 0);

    /**
     * Shared gate for "does a disk reach this id, and does it reach the sink":
     * the same questions, asked in the order the player can act on them.
     * Returns an issue string, or null when the node genuinely sits on a
     * disks → sink path.
     */
    function pathIssueFor(id, label) {
      if (g.out.get(id).length === 0)
        return `Connect the ${label} output — until it is wired, nothing can be `
             + 'said about which RAID you are building.';
      if (!os)
        return `Add ${sink.article} ${sink.label} node to complete the path.`;
      if (!fedByDisk(id)) {
        // Two different builds land here and they need different advice. Nothing
        // wired at all is "start at the disks"; disks wired into a chain that
        // dead-ends is the opposite problem, and telling that player to start at
        // the disks describes something they can see they already did. Found
        // in-browser with two backplanes, the disks auto-routed to the one that
        // was not cabled onward.
        return anyDiskWired
          ? `The disks are wired, but the chain breaks before the ${label} — `
            + 'follow the cables forward from them to find the gap.'
          : `No disk reaches the ${label} yet — the path has to start at the disks.`;
      }
      if (!reachesSink(id))
        return `The ${label} does not reach the ${sink.label} — the path stops before it.`;
      return null;
    }

    // 1. An engine object on the canvas decides — once it is actually ON the
    //    path. Presence alone used to be enough to declare hardware RAID; the
    //    verdict came out before a single cable existed.
    for (const def of engines) {
      const ids = Graph.nodesWith(g, def.id);
      if (!ids.length) continue;
      const id    = ids.find(onPath) ?? ids[0];
      const issue = pathIssueFor(id, displayName(def));
      if (issue) return undetermined(issue);
      return { raidType: def.verdict.raidType, os, complete: true, issue: null,
               engineNodeId: id, reason: def.verdict.reason };
    }

    // 2. No engine object anywhere. Only the FIRST hop — routing the disks
    //    somewhere — is common to every verdict, so it is the only one advised
    //    unconditionally; the pieces named are whatever accepts these disks.
    if (!anyDiskWired) {
      const labels = unique(disks.flatMap((d) => catalog.acceptorsOf(d.protocol))
        .map((a) => displayName(catalog.get(a.componentId))));
      if (!labels.length)
        return undetermined('No component accepts these disks — the catalogue has nowhere to route them.');
      return undetermined(`Nothing carries the disks anywhere yet — add a ${labels.join(' or ')} `
        + 'so they have somewhere to go.');
    }

    // 3. Past the first hop, say nothing while an engine verdict is still open:
    //    naming the next piece would presume a direction the player has not
    //    chosen. A verdict is open while some loose end of a disk-fed chain
    //    has an output that could feed that engine's input.
    const frontierTypes = unique(Array.from(g.nodes.values())
      .filter((n) => n.componentId && fedByDisk(n.id) && (g.out.get(n.id) || []).length === 0)
      .flatMap((n) => catalog.portsOf(n.componentId).filter((p) => p.dir === 'out').map((p) => p.type)));
    const anyOpen = engines.some((def) => def.ports.some((p) =>
      p.dir === 'in' && frontierTypes.some((t) => catalog.connectsTo(t).includes(p.type))));
    if (anyOpen) return undetermined(null);

    // 4. Only the sink's own verdict remains: the OS is the engine.
    if (!os)
      return undetermined(`Add ${sink.article} ${sink.label} node to complete the path.`);
    const sinkId = sinkIds[0];
    if (!fedByDisk(sinkId))
      return undetermined(`The disks are wired, but the chain breaks before the ${sink.label} — `
        + 'follow the cables forward from them to find the gap.');
    const def = catalog.get(os);
    if (!def.verdict)
      return undetermined(`${displayName(def)} declares no verdict — the catalogue is incomplete.`);
    return { raidType: def.verdict.raidType, os, complete: true, issue: null,
             engineNodeId: null, reason: def.verdict.reason };
  }

  // ---------------------------------------------------------------------------
  // VIEW — what the validator sees (never the raw cp* Maps)
  // ---------------------------------------------------------------------------

  /**
   * Build the derived physical view the validator consumes.
   *   engineCount — engine objects on the canvas (verdict-bearing, non-sink); >1 is illegal
   *   diskRoutes  — each disk's protocol + the component it actually wires into
   */
  function buildView(cpNodes, cpEdges, disks, cp, catalog) {
    let engineCount = 0;
    if (catalog) {
      const sink = sinkRole(catalog);
      const ids  = new Set(engineDefs(catalog, sink).map((d) => d.id));
      engineCount = Array.from(cpNodes.values()).filter((n) => ids.has(n.componentId)).length;
    }

    const diskRoutes = [];
    for (const d of disks) {
      const edge   = Array.from(cpEdges.values()).find((e) => e.fromNode === d.id);
      const target = edge ? (cpNodes.get(edge.toNode)?.componentId ?? null) : null;
      diskRoutes.push({ id: d.id, protocol: d.protocol, target });
    }
    return { raidType: cp.raidType, os: cp.os, engineCount, diskRoutes };
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  const RaidPhysical = { recognize, buildView, displayName };

  if (typeof module !== 'undefined' && module.exports) module.exports = RaidPhysical;
  else root.RaidPhysical = RaidPhysical;

})(typeof globalThis !== 'undefined' ? globalThis : this);
