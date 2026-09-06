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
 * The same tree is read twice (specs/implemented/degenerate-levels.md): for its FORM
 * — the recognizer, box 1 — and for its BEHAVIOUR — `normalize()` rewrites it
 * bottom-up by the rules the level files declare, the recognizer names the
 * result, box 2. The numbers are computed on the normalised tree.
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
  //   W (write penalty), from redundancy:  none=1 · mirror=copies · parity1=4 · parity2=6
  //   N (parallelism),   from segmentation: striped → stripe width · linear → 1 ·
  //                      mirror → one copy's width (the copies are the same data)
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
  // A mirror writes every copy, so its W is the copy count times what one copy
  // costs: a pair of disks → 2, a three-way mirror → 3, a mirror of two RAID 5
  // spans → 2 × 4, every copy paying its own read-modify-write. The flat striped
  // mirror (RAID 10 / 1E) has `copies` copies of each chunk → `copies`.
  function writePenalty(node, mode = 'random') {
    if (isDisk(node)) return 1;
    const table = mode === 'sequential'
      ? { none: 1, parity1: 1, parity2: 1 }   // parity amortized on full-stripe
      : { none: 1, parity1: 4, parity2: 6 };  // random read-modify-write
    if (node.redundancy === 'mirror')
      return isStripedDiskMirror(node)
        ? copiesOf(node)
        : node.members.length * Math.max(...node.members.map((m) => writePenalty(m, mode)));
    if (node.redundancy === 'none' && allArrays(node))
      return Math.max(...node.members.map((m) => writePenalty(m, mode)));
    return table[node.redundancy];
  }

  // Disks ONE write is spread over. Striping spreads it over the stripe; a
  // concatenation writes one member at a time; a mirror writes every copy, and
  // the copies are the same data, so what one write is spread over is one copy's
  // width — a mirror of disks: 1; a mirror of striped legs (RAID 0+1): the leg's
  // width, the same as the RAID 1+0 over the same disks. The penalty charges for
  // the copies (tech-debt/mirror-of-stripes-write-parallelism.md).
  function writeParallelism(node) {
    if (isDisk(node)) return 1;
    if (node.segmentation === 'striped')
      return allArrays(node)
        ? sum(node.members.map(writeParallelism))   // nested: sum child widths
        : node.members.length;                       // leaf stripe (incl. flat RAID 10)
    if (node.redundancy === 'mirror')
      return Math.max(...node.members.map(writeParallelism));   // one copy's width
    return 1;                                         // linear: one member at a time
  }

  // Disks serving parallel READS — striping spreads data; mirroring fans copies.
  // A mirror's read can be served by ANY member, whatever that member is, so a
  // mirror sums what its members can each deliver (a mirror of disks: one per
  // copy; a mirror of striped legs: the whole width of every leg).
  function readParallelism(node) {
    if (isDisk(node)) return 1;
    if (node.segmentation === 'striped')
      return allArrays(node)
        ? sum(node.members.map(readParallelism))
        : node.members.length;
    if (node.redundancy === 'mirror') return sum(node.members.map(readParallelism));
    return 1;                                                       // JBOD: one disk
  }

  // Disks ONE logical read is spread over. Striping spreads it; mirroring does
  // not — a single read is served by one member — so a mirror is exactly as wide
  // as the member serving it. This is what separates "the array reads faster" from
  // "the array serves more readers at once".
  function readWidth(node) {
    if (isDisk(node)) return 1;
    if (node.segmentation === 'striped')
      return allArrays(node)
        ? sum(node.members.map(readWidth))
        : node.members.length;
    if (node.redundancy === 'mirror')
      return node.members.reduce((w, m) => Math.max(w, readWidth(m)), 1);
    return 1;                                                       // JBOD: one disk
  }

  // Buckets quantize the formula (the formula is authoritative, the bucket is
  // presentation). writeClass keys on striping first (parallelism), then penalty.
  /**
   * readClass folds the two read quantities, never the shape of a named level:
   *   width > 1            → 'high'   (one read is spread over several disks)
   *   fanout > width       → 'medium' (no spread, but copies serve readers in parallel)
   *   one disk in the tree → 'high'   (it reads like the single disk it is)
   *   otherwise            → 'low'    (one disk at a time while the others sit idle)
   * A bare disk is the 'high' baseline the multipliers are measured against.
   * @returns {PerfClass}
   */
  function readClass(node) {
    if (isDisk(node)) return 'high';
    const width = readWidth(node);
    if (width > 1) return 'high';
    if (readParallelism(node) > width) return 'medium';
    return countDisks(node) === 1 ? 'high' : 'low';
  }

  /** @returns {PerfClass} */
  function writeClass(node, mode = 'random') {
    if (isDisk(node)) return 'high';
    if (!topIsStriped(node)) {
      if (node.redundancy === 'none') return 'low';                // concatenation: one member at a time
      if (!allArrays(node))           return 'medium';             // a mirror of disks: width 1, every copy written
    }                                                              // a mirror of arrays writes at a copy's width → by penalty
    const w = writePenalty(node, mode);
    if (w <= 2) return 'high';                                     // RAID 0 (1), RAID 10 (2), RAID 0+1 (2 × 1)
    if (w === 4) return 'medium';                                  // RAID 5/50 (random RMW)
    return 'low';                                                  // RAID 6/60, RAID 51 (2 × 4)
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
      writePenalty:           writePenalty(node, 'random'),
      writePenaltySequential: writePenalty(node, 'sequential'),
      parallelism:            writeParallelism(node),
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
  // NORMALIZE (specs/implemented/degenerate-levels.md §4) — what the player HAS,
  // derived from what they composed by rewriting the tree bottom-up. Every
  // rewrite is one the level catalogue declares — a leaf level's `collapsesTo`
  // at a width below its minimum, or a level that `absorbsNested` members of
  // its own shape — so this function names no level and knows no width. The
  // list of rewrites that fired is the TRACE: the diff between the two boxes.
  // It is empty when nothing collapsed, and that is information too — what you
  // built is what you have.
  // ---------------------------------------------------------------------------

  /**
   * @param {TreeNode} node @param {Levels | null} [levels]
   * @returns {{ tree: TreeNode, trace: Rewrite[] }}  a NEW tree; the input is never mutated
   */
  function normalize(node, levels) {
    /** @type {Rewrite[]} */
    const trace = [];
    const shapeOf = (n) => ({ segmentation: n.segmentation, redundancy: n.redundancy, members: n.members.length });
    const record = (rule, level, from, to, { because, source }) => {
      const named = levels.match(to);   // what the catalogue calls the rewritten node, if anything
      trace.push({ rule, level: level.id, nodeId: from.id, from: shapeOf(from), to: shapeOf(to),
                   runsAs: named ? named.name : null, because, source });
    };

    // A node whose members all have the same leaf shape as itself, when the level
    // of that shape says nesting it inside itself changes nothing (a mirror of
    // mirrors is one mirror): the members' disks become the node's own.
    const absorb = (n) => {
      if (!allArrays(n)) return n;
      const sameLeaf = (m) => m.segmentation === n.segmentation && m.redundancy === n.redundancy && allDisks(m);
      if (!n.members.every(sameLeaf)) return n;
      const flat  = array(n.segmentation, n.redundancy, n.members.flatMap((m) => m.members), null, n.id);
      const level = levels.match(flat);
      if (!level || !level.absorbsNested) return n;
      record('absorb', level, n, flat, level.absorbsNested);
      return flat;
    };

    // A leaf node at a width its level declares a collapse for: the same disks,
    // the declared shape. The algorithm goes — it belonged to the old class.
    const collapse = (n) => {
      if (!allDisks(n)) return n;
      const level = levels.match(n);
      const rule  = level && (level.collapsesTo || []).find((c) => c.disks === n.members.length);
      if (!rule) return n;
      const to = array(rule.becomes.segmentation, rule.becomes.redundancy, n.members, null, n.id);
      record('collapse', level, n, to, rule);
      return to;
    };

    const rewrite = (n) => {
      if (isDisk(n)) return n;
      const copy = { ...n, members: n.members.map(rewrite) };   // leaves first (§4: bottom-up)
      return levels ? collapse(absorb(copy)) : copy;
    };

    return { tree: rewrite(node), trace };
  }

  // ---------------------------------------------------------------------------
  // ANALYZE — one call that returns the full picture for a build.
  // ---------------------------------------------------------------------------

  /**
   * One call that returns the full picture for a build. The recognition at the
   * top is box 1 — the FORM, what was composed. The numbers are computed on the
   * normalised tree, because they belong to what runs (spec §7); `runs` is box 2
   * — the BEHAVIOUR: what that tree is called, the tree itself, and the trace.
   * When nothing collapses the two trees coincide and the numbers are unchanged.
   * @param {TreeNode} node @param {Levels | null} [levels]
   * @returns {Analysis}
   */
  function analyze(node, levels) {
    const { tree, trace } = normalize(node, levels);
    const perf = performance(tree);
    return {
      ...recognize(node, levels),
      diskCount:      countDisks(tree),
      capacityGB:     capacityGB(tree),
      rawCapacityGB:  rawCapacityGB(tree),
      faultTolerance: faultTolerance(tree),
      readClass:      perf.random.readClass,    // flat convenience keys, 1:1 with challenge metrics
      writeClass:     perf.random.writeClass,   // conservative (random) — challenges opt into seq
      performance:    perf,
      runs:           { ...recognize(tree, levels), tree, trace },
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
    recognize, normalize, capacityGB, rawCapacityGB, faultTolerance, performance, analyze,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RaidModel;   // Node (for testing)
  } else {
    root.RaidModel = RaidModel;   // Browser
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
