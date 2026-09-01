/**
 * physical.js — RAID Sandbox: the physical-layer recognizer (axis A, ADR-001).
 *
 * PURE and headless: takes the two raw control-path maps plus the disk list,
 * returns the hardware / fake / software verdict — with the reason, or the one
 * issue the player can act on next. This is the brain of axis A; it used to live
 * inside canvas-state.js (the file that owns the mutable state) and moved here so
 * the engine layer holds every derivation and the sandbox layer none.
 *
 *   recognize(cpNodes, cpEdges, disks)   → { raidType, os, complete, issue, reason?, engineNodeId? }
 *   buildView(cpNodes, cpEdges, disks, cp) → the derived PhysicalView the validator consumes
 *
 * `disks` is [{ id, protocol }]: disks live on axis B and appear in cpEdges by
 * id only, so the recognizer has to be told which endpoints are sources.
 *
 * What it does NOT do: read files, know the catalogue, or touch the DOM. It
 * still names component ids (`engine-roc`, `hba`, `os-linux`, …) in code — that
 * is the next refactor step (verdict from declared capabilities), kept separate
 * so this move stays mechanical and reviewable on its own.
 *
 * Depends on: graph.js (RaidGraph).
 */

(function (root) {
  'use strict';

  const Graph = (typeof require !== 'undefined') ? require('./graph.js') : root.RaidGraph;

  /**
   * Build the derived physical view the validator consumes (never the raw cp* Maps).
   * `disks` is the axis-B disk list as [{ id, protocol }] (see canvas-state _diskIds).
   *   engineCount — RAID-engine-bearing nodes (engine-roc or engine-metadata); >1 is illegal
   *   diskRoutes  — each disk's protocol + the component it actually wires into
   */
  function buildView(cpNodes, cpEdges, disks, cp) {
    const engineCount = Array.from(cpNodes.values())
      .filter((n) => n.componentId === 'engine-roc' || n.componentId === 'engine-metadata').length;

    const diskRoutes = [];
    for (const d of disks) {
      const edge   = Array.from(cpEdges.values()).find((e) => e.fromNode === d.id);
      const target = edge ? (cpNodes.get(edge.toNode)?.componentId ?? null) : null;
      diskRoutes.push({ id: d.id, protocol: d.protocol, target });
    }
    return { raidType: cp.raidType, os: cp.os, engineCount, diskRoutes };
  }

  /**
   * Derive hardware/fake/software from the physical layer graph.
   *
   * Rules (ADR-001 — identity, not position):
   *   A node with componentId 'engine-roc'      on the path → Hardware RAID
   *   A node with componentId 'engine-metadata' on the path → Fake RAID
   *   Neither object anywhere, OS reached directly           → Software RAID
   *     (the OS itself is the engine: `provides: raid-engine`, os-linux.yaml /
   *     os-windows.yaml)
   *
   * The verdict is a claim about a PATH, so it is derived by walking one
   * (`engine/graph.js`). A component is on the path only if a disk reaches it
   * AND it reaches an OS — presence alone (a floating node) does not count.
   *
   * The HBA-in-path requirement is scoped to SATA/SAS disks (checked via each
   * disk's protocol, carried in `disks`): NVMe disks reach the PCIe bus
   * directly and were wrongly blocked by an unconditional HBA gate before
   * (tech-debt/nvme-software-raid-unbuildable.md).
   *
   * Every determined verdict also carries `reason` and `engineNodeId`. The panel
   * used to show the verdict alone, which hides the one insight axis A exists to
   * teach (§2): hardware/software/fake are the SAME path, told apart by which
   * engine object sits on it (or none). The explanation belongs here, with the
   * derivation — a view that re-derives it could disagree with the badge above it.
   */
  function recognize(cpNodes, cpEdges, disks) {
    const g     = Graph.build(cpNodes, cpEdges);
    disks       = disks || [];

    const osIds  = Graph.nodesWith(g, 'os-linux').concat(Graph.nodesWith(g, 'os-windows'));
    const os     = osIds.length ? g.nodes.get(osIds[0]).componentId : null;
    const osName = os === 'os-windows' ? 'Windows' : 'Linux';

    const undetermined = (issue) => ({ raidType: null, os: null, complete: false, issue });

    // The two halves of "on the path", kept separate because they fail with
    // different advice: nothing feeds this, versus this feeds nothing.
    const fedByDisk = (id) => disks.some((d) => Graph.reaches(g, d.id, id));
    const reachesOS = (id) => osIds.some((o) => Graph.reaches(g, id, o));
    const onPath    = (id) => fedByDisk(id) && reachesOS(id);

    const rocIds  = Graph.nodesWith(g, 'engine-roc');
    const chipIds = Graph.nodesWith(g, 'engine-metadata');

    /**
     * Shared gate for "does a disk reach this id, and does it reach an OS":
     * the same questions, asked in the order the player can act on them.
     * Returns an issue string, or null when the node genuinely sits on a
     * disks→OS path. Used both for an engine object and, when there is none,
     * for the OS node itself (the software verdict).
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
        const anyDiskWired = disks.some((d) => (g.out.get(d.id) || []).length > 0);
        return anyDiskWired
          ? `The disks are wired, but the chain breaks before the ${label} — `
            + 'follow the cables forward from them to find the gap.'
          : `No disk reaches the ${label} yet — the path has to start at the disks.`;
      }
      if (!reachesOS(id))
        return `The ${label} does not reach the OS — the path stops before it.`;
      return null;
    }

    /**
     * SATA/SAS disks need an HBA between them and `id`; NVMe disks reach PCIe
     * directly and need none (tech-debt/nvme-software-raid-unbuildable.md).
     * `id` is either an engine object or, for the software verdict, the OS
     * node — the sentence reads naturally either way.
     */
    function hbaGateFor(id, label) {
      const feeding  = disks.filter((d) => Graph.reaches(g, d.id, id));
      const needsHba = feeding.some((d) => d.protocol !== 'NVMe');
      if (!needsHba) return null;

      const hbas      = Graph.nodesWith(g, 'hba');
      const hbaOnPath = hbas.some((h) => fedByDisk(h) && Graph.reaches(g, h, id));
      if (hbaOnPath) return null;

      // There used to be a second message here for an HBA wired downstream of
      // the engine. With typed ports that canvas cannot be drawn (nothing but a
      // backplane outputs `routing`, and no engine feeds a backplane), so the
      // branch described a state no player will ever see. Removed 2026-09-02.
      return `Route the SATA/SAS disks through an HBA before the ${label} — `
           + 'without it nothing carries them there.';
    }

    // A RAID-on-Chip dropped on the canvas is not yet ON the path. Presence
    // alone used to be enough to declare hardware RAID — the verdict came out
    // before a single cable existed. It already includes protocol translation
    // (provides: protocol-translation), so no separate HBA gate applies.
    if (rocIds.length) {
      const rocId = rocIds.find(onPath) ?? rocIds[0];
      const issue = pathIssueFor(rocId, 'RAID Engine (RoC)');
      if (issue) return undetermined(issue);

      return { raidType: 'hardware', os: null, complete: true, issue: null,
               engineNodeId: rocId,
               // Names the piece exactly as the canvas labels it. A sentence
               // that says "the controller card" points at something the
               // player cannot find: that name exists nowhere in the game.
               reason: 'The RAID engine is a RAID-on-Chip — it sits before the '
                     + 'PCIe bus, builds the array itself, and the OS sees one virtual drive.' };
    }

    if (chipIds.length) {
      const chipId = chipIds.find(onPath) ?? chipIds[0];
      const issue  = pathIssueFor(chipId, 'RAID Engine (metadata)');
      if (issue) return undetermined(issue);

      const hbaIssue = hbaGateFor(chipId, 'RAID Engine (metadata)');
      if (hbaIssue) return undetermined(hbaIssue);

      return { raidType: 'fake', os, complete: true, issue: null,
        engineNodeId: chipId,
        reason: 'The RAID engine is a metadata-only chip — it owns the array '
              + 'metadata, but the CPU still computes the parity, not the chip.' };
    }

    // Software RAID: neither engine object is anywhere on the canvas, so the
    // OS itself is the engine (`provides: raid-engine`). Only the FIRST hop
    // (routing the disks somewhere) is common to all three verdicts, so it
    // is the only one advised unconditionally; past it, hardware and fake
    // stay open for a while (see hardwareOpen/fakeOpen below) and nothing
    // is said until only software remains possible.
    const anyDiskWired = disks.some((d) => (g.out.get(d.id) || []).length > 0);
    if (!anyDiskWired) {
      const allNvme = disks.length > 0 && disks.every((d) => d.protocol === 'NVMe');
      return undetermined(allNvme
        ? 'Nothing carries the disks anywhere yet — add a PCIe bus so they have somewhere to go.'
        : 'Nothing carries the disks anywhere yet — add a Backplane so they have somewhere to go.');
    }

    // Past this point, do NOT name a specific next component unless it is
    // required by EVERY verdict still reachable from here — naming one that
    // only some remaining verdicts need presumes the direction the player
    // has not chosen yet (the same "derive, don't select" principle the
    // level recognizer already follows for axis B).
    const hbas = Graph.nodesWith(g, 'hba');

    // Hardware is open until an HBA actually intercepts the disk flow: a RoC
    // wired straight from the Backplane skips the HBA entirely (it already
    // provides protocol-translation). NVMe disks never reach a RoC at all
    // (its input is routing-typed, NVMe disks auto-route to PCIe) — hardware
    // was never open for them, so it can't be what's still blocking software.
    const hardwareOpen = disks.some((d) => d.protocol !== 'NVMe') && !hbas.some(fedByDisk);
    if (hardwareOpen) return undetermined(null);

    // Past the HBA, hardware is foreclosed (its pcie-typed output cannot
    // reach the RoC's routing-typed input), but fake is still open — a
    // metadata chip could still be wired in before the CPU — until a CPU is
    // actually reached with no chip node on the canvas to have gone through.
    const cpuIds  = Graph.nodesWith(g, 'cpu');
    const fakeOpen = !cpuIds.some(fedByDisk);
    if (fakeOpen) return undetermined(null);

    if (!os)
      return undetermined('Add an OS node to complete the path.');

    // The OS is a sink (no output port), so the question is just "does a
    // disk reach it" — not the "is its own output wired" question
    // pathIssueFor asks for engine nodes.
    const osId = osIds[0];
    if (!fedByDisk(osId))
      return undetermined('The disks are wired, but the chain breaks before the OS — '
        + 'follow the cables forward from them to find the gap.');

    const hbaIssue = hbaGateFor(osId, 'OS');
    if (hbaIssue) return undetermined(hbaIssue);

    return { raidType: 'software', os, complete: true, issue: null,
      engineNodeId: null,
      reason: `No RAID engine sits on the path — ${osName} and the CPU compute `
            + 'the layout themselves, with no RAID hardware involved.' };
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  const RaidPhysical = { recognize, buildView };

  if (typeof module !== 'undefined' && module.exports) module.exports = RaidPhysical;
  else root.RaidPhysical = RaidPhysical;

})(typeof globalThis !== 'undefined' ? globalThis : this);
