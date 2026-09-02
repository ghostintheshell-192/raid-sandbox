// @ts-check
/**
 * model.js — RAID Sandbox: the recursive domain model + level recognizer.
 *
 * Phase 1 of the rework (see .development/specs/planned/raid-sandbox-domain-model.md).
 * This file is HEADLESS: pure logic, no DOM. It answers the founding question —
 * "given this tree, what did I build?" — without any UI.
 *
 * Core idea (§3 of the spec): an array does not contain disks, it contains MEMBERS,
 * and a member is either a Disk or another Array. Recursion gives nested RAID
 * (10 / 50 / 60 / 6+0) for free.
 *
 * An array's layout is TWO ORTHOGONAL choices (the step-by-step gameplay axes):
 *
 *   segmentation ∈ { striped, linear }      ← how data is split across members
 *   redundancy   ∈ { none, mirror, parity1, parity2 }  ← how data is protected
 *
 * The two are genuinely independent:
 *   - segmentation drives the NAME (RAID 0 vs JBOD) and the data-placement animation;
 *   - redundancy drives CAPACITY and FAULT TOLERANCE.
 *
 *   Node =
 *     | Disk  { kind:'disk',  id, sizeGB, protocol }
 *     | Array { kind:'array', segmentation, redundancy, members:[Node], algorithm? }
 *
 * The NAME of a shape is data: `recognize(node, levels)` matches the tree against
 * the level catalogue (levels.js, built from data/raid-levels/*.yaml). The
 * derivations below — capacity, fault tolerance, performance — are folds over the
 * same tree and stay here: they are the domain's arithmetic, not its vocabulary.
 *
 * Exposed as the global `RaidModel` in the browser, and via module.exports under Node.
 */

(function (/** @type {any} */ root) {   // the UMD host: window, or Node's global
  'use strict';

  // ---------------------------------------------------------------------------
  // CONSTRUCTORS / GUARDS
  // ---------------------------------------------------------------------------

  const SEGMENTATIONS = ['striped', 'linear'];
  const REDUNDANCIES  = ['none', 'mirror', 'parity1', 'parity2'];

  /**
   * Build a disk leaf.
   * @param {string} id @param {number} sizeGB @param {string} [protocol]
   * @returns {Disk}
   */
  function disk(id, sizeGB, protocol = 'SATA') {
    return { kind: 'disk', id, sizeGB, protocol };
  }

  /**
   * Build an array node over a list of member nodes (disks or arrays).
   * @param {Segmentation} segmentation
   * @param {Redundancy} redundancy
   * @param {TreeNode[]} members
   * @param {string | null} [algorithm]
   * @param {string | null} [id]  the canvas node this array was compiled from, when there is
   *                     one. Carried so a per-node consumer (the validator's
   *                     (code, nodeId) dedup, UI highlighting) can tell two arrays
   *                     apart; a hand-built tree has no canvas behind it and passes
   *                     nothing. The model itself never reads it.
   * @returns {ArrayNode}
   */
  function array(segmentation, redundancy, members, algorithm = null, id = null) {
    if (!SEGMENTATIONS.includes(segmentation)) throw new Error(`Unknown segmentation: ${segmentation}`);
    if (!REDUNDANCIES.includes(redundancy))    throw new Error(`Unknown redundancy: ${redundancy}`);
    return { kind: 'array', id, segmentation, redundancy, members, algorithm };
  }

  const isDisk  = (n) => n && n.kind === 'disk';
  const isArray = (n) => n && n.kind === 'array';

  const allDisks  = (arr) => arr.members.length > 0 && arr.members.every(isDisk);
  const allArrays = (arr) => arr.members.length > 0 && arr.members.every(isArray);

  // Flat RAID 10 / RAID 1E (§3a): a striped mirror directly over disks, `copies`
  // replicas (default 2). Distinct from linear+mirror (RAID 1, n-way) and from
  // mirror-over-arrays (e.g. RAID 51) — those keep the n-way capacity/FT math.
  const isStripedDiskMirror = (n) =>
    isArray(n) && n.segmentation === 'striped' && n.redundancy === 'mirror' && allDisks(n);
  const copiesOf = (n) => n.copies || 2;

  /** Total number of physical disks under a node (recursive). */
  function countDisks(node) {
    if (isDisk(node)) return 1;
    return node.members.reduce((sum, m) => sum + countDisks(m), 0);
  }

  // ---------------------------------------------------------------------------
  // RECOGNIZER (§4) — derive the RAID level by matching the tree's SHAPE against
  // the level catalogue (data/raid-levels/*.yaml, indexed by levels.js). The
  // shapes are data; what stays here is the contract of the answer:
  // recognition is SEPARATE from validation — a build can be perfectly valid
  // and still have no canonical name → flag 'non-standard-config', a first-class
  // result, not an error.
  // ---------------------------------------------------------------------------

  /**
   * @param {TreeNode} node    the tree to name
   * @param {Levels | null} [levels]  the level catalogue (RaidLevels.createLevels); without one no
   *                shape can be named, and the result says so
   * @returns {Recognition}
   */
  function recognize(node, levels) {
    /** @param {string} reason @returns {Recognition} */
    const unnamed = (reason) =>
      ({ level: null, recognized: false, notRaid: false, flag: 'non-standard-config', reason });

    if (isDisk(node)) return unnamed('A single disk is not an array.');
    if (!levels)      return unnamed('no level catalogue loaded — the shape cannot be named');

    const hit = levels.match(node);
    if (!hit) return unnamed('valid composition with no standard RAID name');
    return { level: hit.name, recognized: true, notRaid: !!hit.notRaid, flag: null,
             reason: levels.reasonFor(hit, node) };
  }

  // ---------------------------------------------------------------------------
  // CAPACITY (§5c) — usable capacity in GB, derived recursively.
  // Depends on the redundancy axis + `copies`. One exception to "segmentation
  // doesn't matter": striped+mirror over disks is flat RAID 10 (n/copies), unlike
  // linear+mirror = RAID 1 (one copy's worth). See §3a.
  // Exact when all disks in an array are equal-sized (the common case); for mixed
  // sizes the parity terms approximate (real controllers coerce to the smallest disk).
  // ---------------------------------------------------------------------------

  function capacityGB(node) {
    if (isDisk(node)) return node.sizeGB;
    const caps = node.members.map(capacityGB);
    switch (node.redundancy) {
      case 'none':    return sum(caps);
      case 'mirror':  return isStripedDiskMirror(node)
        ? sum(caps) / copiesOf(node)                         // flat RAID 10/1E: n/copies disks (§3a)
        : Math.min(...caps);                                 // RAID 1 / mirror-of-arrays: one copy
      case 'parity1': return sum(caps) - Math.max(...caps);  // lose one member's worth
      case 'parity2': {                                      // lose the two largest
        const [, , ...rest] = [...caps].sort((x, y) => y - x);
        return sum(rest);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // FAULT TOLERANCE — guaranteed (worst-case) number of disk failures survived.
  // Depends ONLY on the redundancy axis.
  //
  // failuresToKill(node) = minimum disk losses to destroy the node, assuming an
  // adversary places failures to do maximum damage:
  //
  //   disk     → 1
  //   none     → min over children   (any one child gone kills the array)
  //   mirror   → striped-disk mirror (flat RAID 10/1E): `copies` (lose all copies of a chunk);
  //              else sum over ALL children (RAID 1 / mirror-of-arrays: ≥1 member lives)
  //   parity1  → sum of the 2 smallest children (survives 1 failed member)
  //   parity2  → sum of the 3 smallest children (survives 2 failed members)
  //
  // guaranteedFaultTolerance = failuresToKill(top) - 1
  // Checks: RAID0→0, RAID1(2)→1, RAID5→1, RAID6→2, RAID10→1, RAID50→1, RAID60→2.
  // ---------------------------------------------------------------------------

  function failuresToKill(node) {
    if (isDisk(node)) return 1;
    const costs = node.members.map(failuresToKill);
    switch (node.redundancy) {
      case 'none':    return Math.min(...costs);
      case 'mirror':  return isStripedDiskMirror(node)
        ? copiesOf(node)                                 // flat RAID 10/1E: lose all copies of a chunk
        : sum(costs);                                    // RAID 1 / mirror-of-arrays: kill every member
      case 'parity1': return sumSmallest(costs, 2);      // must fail 2 members
      case 'parity2': return sumSmallest(costs, 3);      // must fail 3 members
    }
  }

  const faultTolerance = (node) => failuresToKill(node) - 1;

  // ---------------------------------------------------------------------------
  // PERFORMANCE (§4b) — derived, measurable, from the same two axes.
  //
  // Like capacity and fault-tolerance, performance is DERIVED, never eyeballed,
  // so prompt-mode requirements ("optimized for sequential reads") become
  // checkable the same way as `faultTolerance >= 2`.
  //
  // Two canon quantities (storage-design write-penalty table; the parity small-
  // write cost is the Patterson/Gibson/Katz "small-write problem"):
  //   W (write penalty), from redundancy:  none=1 · mirror=2 · parity1=4 · parity2=6
  //   N (parallelism),   from segmentation: striped → stripe width · linear → 1
  //
  // We report MULTIPLIERS vs a single disk — read ≈ N×, write ≈ N/W× — not
  // absolute IOPS: IOPS_disk is never a player input, and buckets + "optimize
  // for X" checks need only the ratio. (IOPS_array = (N×IOPS_disk)/(rf + W·wf).)
  //
  // The one nuance (§4b): on large SEQUENTIAL full-stripe writes, parity is
  // computed once per stripe instead of read-modify-write, so the parity penalty
  // nearly vanishes (W→1). Mirror still writes every copy, so its W stays 2.
  // We therefore expose both a `random` and a `sequential` characterization.
  // ---------------------------------------------------------------------------

  const topIsStriped = (n) => isArray(n) && n.segmentation === 'striped';

  // Write penalty W. For a nested stripe-over-spans the physical writes land in
  // the child spans, so the effective W is the span's, not the top stripe's
  // (RAID 50/60 inherit the parity penalty). Spans are uniform by the recognizer.
  function writePenalty(node, mode = 'random') {
    if (isDisk(node)) return 1;
    const table = mode === 'sequential'
      ? { none: 1, mirror: 2, parity1: 1, parity2: 1 }   // parity amortized on full-stripe
      : { none: 1, mirror: 2, parity1: 4, parity2: 6 };  // random read-modify-write
    if (node.redundancy === 'none' && allArrays(node))
      return Math.max(...node.members.map((m) => writePenalty(m, mode)));
    return table[node.redundancy];
  }

  // Stripe width feeding parallel WRITES (linear → 1, the single active member).
  function writeParallelism(node) {
    if (isDisk(node)) return 1;
    if (node.segmentation === 'striped')
      return allArrays(node)
        ? sum(node.members.map(writeParallelism))   // nested: sum child widths
        : node.members.length;                       // leaf stripe (incl. flat RAID 10)
    return 1;                                         // linear
  }

  // Disks serving parallel READS — striping spreads data; mirroring fans copies.
  function readParallelism(node) {
    if (isDisk(node)) return 1;
    if (node.segmentation === 'striped')
      return allArrays(node)
        ? sum(node.members.map(readParallelism))
        : node.members.length;
    if (node.redundancy === 'mirror') return node.members.length;  // RAID 1: read from any copy
    return 1;                                                       // JBOD: one disk
  }

  // Buckets quantize the formula (the formula is authoritative, the bucket is
  // presentation). writeClass keys on striping first (parallelism), then penalty.
  /** @returns {PerfClass} */
  function readClass(node) {
    if (isDisk(node)) return 'high';
    if (topIsStriped(node)) return 'high';                          // RAID 0/5/6/10/50/60
    if (node.redundancy === 'mirror') return 'medium';             // RAID 1: fan across copies
    return 'low';                                                  // JBOD
  }

  /** @returns {PerfClass} */
  function writeClass(node, mode = 'random') {
    if (isDisk(node)) return 'high';
    if (!topIsStriped(node))                                       // linear: single-disk write path
      return node.redundancy === 'mirror' ? 'medium' : 'low';
    const w = writePenalty(node, mode);
    if (w <= 2) return 'high';                                     // RAID 0 (1), RAID 10 (2)
    if (w === 4) return 'medium';                                  // RAID 5/50 (random RMW)
    return 'low';                                                  // RAID 6/60
  }

  const round2 = (x) => Math.round(x * 100) / 100;

  /** @returns {PerfProfile} */
  function characterize(node, mode) {
    return {
      readMult:   readParallelism(node),
      writeMult:  round2(writeParallelism(node) / writePenalty(node, mode)),
      readClass:  readClass(node),
      writeClass: writeClass(node, mode),
    };
  }

  function performance(node) {
    return {
      writePenalty: writePenalty(node, 'random'),
      parallelism:  writeParallelism(node),
      random:       characterize(node, 'random'),
      sequential:   characterize(node, 'sequential'),
    };
  }

  // Raw (physical) capacity = sum of every leaf disk's size, independent of the
  // topology. With diskCount it pins the DISK SUPPLY a challenge hands you (e.g.
  // "6 × 4 TB" → diskCount 6, rawCapacityGB 24), separate from usable capacity.
  function rawCapacityGB(node) {
    if (isDisk(node)) return node.sizeGB;
    return sum(node.members.map(rawCapacityGB));
  }

  // ---------------------------------------------------------------------------
  // ANALYZE — one call that returns the full picture for a build.
  // ---------------------------------------------------------------------------

  /**
   * One call that returns the full picture for a build.
   * @param {TreeNode} node @param {Levels | null} [levels]
   * @returns {Analysis}
   */
  function analyze(node, levels) {
    const perf = performance(node);
    return {
      ...recognize(node, levels),
      diskCount:      countDisks(node),
      capacityGB:     capacityGB(node),
      rawCapacityGB:  rawCapacityGB(node),
      faultTolerance: faultTolerance(node),
      readClass:      perf.random.readClass,    // flat convenience keys, 1:1 with challenge metrics
      writeClass:     perf.random.writeClass,   // conservative (random) — challenges opt into seq
      performance:    perf,
    };
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const sumSmallest = (xs, k) => sum([...xs].sort((a, b) => a - b).slice(0, k));

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  const RaidModel = {
    SEGMENTATIONS, REDUNDANCIES, disk, array, isDisk, isArray, countDisks,
    recognize, capacityGB, rawCapacityGB, faultTolerance, performance, analyze,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RaidModel;   // Node (for testing)
  } else {
    root.RaidModel = RaidModel;   // Browser
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
