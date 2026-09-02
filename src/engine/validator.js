// @ts-check
/**
 * validator.js — RAID Sandbox: the constraint engine (Phase 5, Stage C).
 *
 * PURE and headless: takes plain data (the compiled RaidModel tree + a derived
 * physical view), returns the §6 constraint violations. No DOM, no canvas state.
 * This is what makes it testable in Node and reusable by checkChallenge (Stage D).
 *
 *   validate(tree, physical, { levels }) → { hard: Violation[], soft: Violation[] }   // never null
 *   `levels` is the level catalogue (levels.js): the rules that need a level's
 *   name or minimum read it there instead of carrying a table of their own.
 *
 *   Violation = {
 *     code,                       // stable id, e.g. 'min-disks'
 *     severity: 'hard'|'soft',
 *     layer: 'data'|'physical'|'cross',
 *     message,                    // player-facing "why it's invalid"
 *     nodeId:  string|null,       // which array/disk, for UI highlighting
 *     source,                     // carta §6 citation
 *   }
 *
 * Constraints live in a DECLARATIVE REGISTRY (`RULES`): each entry states its
 * identity, severity, layer and source once, and its `run` only answers *where
 * does it fire and why*. `validate` stamps the rest on, so a rule can never
 * disagree with its own registration, and adding a §6 rule is adding one entry.
 *
 * Scope boundary (carta §4 — recognition ≠ validation): this module owns ONLY the
 * §6 semantic constraints. Naming is the recognizer's job; structural incompleteness
 * (<2 members, empty slots) stays with canvas-state's _firstIssue. Three orthogonal
 * jobs over the same tree, so the UI never says the same thing three times.
 *
 * `physical` is a DERIVED view (built by canvas-state from _recognizePhysicalLayer +
 * the disk routing), never the raw cp* Maps — so validator and recognizer can't
 * disagree about what the control path is:
 *   { raidType: 'hardware'|'software'|'fake'|null, os, engineCount, diskRoutes:[{id,protocol,target}] }
 */

(function (/** @type {any} */ root) {   // the UMD host: window, or Node's global
  'use strict';

  const Model = (typeof require !== 'undefined') ? require('./model.js') : root.RaidModel;

  const isDisk    = (n) => n && n.kind === 'disk';
  const isArray   = (n) => n && n.kind === 'array';
  const allDisks  = (a) => a.members.length > 0 && a.members.every(isDisk);
  const allArrays = (a) => a.members.length > 0 && a.members.every(isArray);

  const uniqSorted = (xs) => [...new Set(xs)].sort((x, y) => x - y);
  const fmt        = (n) => Math.round(n * 100) / 100;

  /**
   * Collect every array node (depth-first) together with a STRUCTURAL LABEL.
   *
   * A nested build fires the same rule once per span, with the same wording each
   * time — two identical lines in the panel read as a duplicate, not as two facts.
   * Until violations can highlight their own node, the message has to name its
   * subject itself: the root is "This array", its array children are "Span 1",
   * "Span 2", deeper ones "Span 1.2". Matches the §8 vocabulary: a span IS the
   * child array of a nested level.
   */
  function walkArrays(node, path, acc) {
    if (!isArray(node)) return acc;
    acc.push({ node, label: path.length ? `Span ${path.join('.')}` : 'This array' });
    node.members.forEach((m, i) => walkArrays(m, path.concat(i + 1), acc));
    return acc;
  }

  // ---------------------------------------------------------------------------
  // CONSTRAINT CHECKS (§6) — each independent, reads like the §6 table.
  // A check returns Finding | Finding[] | null, where Finding = { message, nodeId? }.
  // Code, severity, layer and source come from the registry entry, not from here.
  // ---------------------------------------------------------------------------

  // Level-specific disk minimums, read off the level catalogue: a leaf span is
  // matched to its level (RAID 10 vs RAID 1E is the even/odd constraint in the
  // level files, not a rule here) and compared to that level's `minDisks`. The
  // universal ≥2 is STRUCTURAL and stays with canvas-state's _firstIssue, so a
  // level whose minimum is 2 never fires here — the panel would otherwise say
  // the same thing twice.
  function checkMinDisks(tree, physical, ctx) {
    if (!ctx.levels) return null;
    const out = [];
    for (const { node: a, label } of ctx.arrays) {
      if (!allDisks(a)) continue;                     // nested levels checked via their leaf spans
      const level = ctx.levels.match(a);
      if (!level || !(level.minDisks > 2)) continue;
      if (a.members.length < level.minDisks)
        out.push({
          message: `${label} is a ${level.name} — it needs at least ${level.minDisks} disks and has ${a.members.length}.`,
          nodeId: a.id,
        });
    }
    return out;
  }

  // NVMe bypasses the backplane (and controller). In v1 cpAutoRoute enforces this
  // by construction (NVMe → PCIe); the check is a real guard against a routing
  // regression and is unit-testable on its own.
  function checkNvmeBackplane(tree, physical) {
    const out = [];
    for (const r of physical.diskRoutes || []) {
      if (r.protocol === 'NVMe' && r.target === 'backplane')
        out.push({
          message: 'NVMe drives talk straight to the PCIe bus — they bypass the backplane.',
          nodeId: r.id,
        });
    }
    return out;
  }

  // The RAID engine must sit at exactly one point on the path. Zero engines is
  // "incomplete" (already reported by _recognizePhysicalLayer) — only >1 is a
  // violation here, so the two never double-report.
  function checkEngineSinglePoint(tree, physical) {
    if ((physical.engineCount || 0) > 1)
      return {
        message: 'The RAID engine can sit at only one point on the path — you have more than one '
          + '(e.g. a hardware controller and a separate RAID engine).',
      };
    return null;
  }

  // Cross-axis (§6, §9.7): near/far/offset are mdadm layouts — they only exist under
  // Linux software RAID. On hardware/fake build a nested RAID 1+0; Windows Storage
  // Spaces uses its own column/copy scheme. Only fires when the control path is
  // DETERMINED and incompatible (an unbuilt path is the recognizer's job, not ours).
  const MDADM_LAYOUTS = new Set(['near', 'far', 'offset']);

  function checkCrossAxisLayout(tree, physical, ctx) {
    if (!physical.raidType) return null;              // path not determined yet → don't nag
    const linuxSoftware = physical.raidType === 'software' && physical.os === 'os-linux';
    if (linuxSoftware) return null;
    const out = [];
    for (const { node: a, label } of ctx.arrays) {
      if (MDADM_LAYOUTS.has(a.algorithm))
        out.push({
          message: `${label} uses the "${a.algorithm}" layout, which only exists under Linux `
            + `software RAID (mdadm). On ${physical.raidType} RAID, build a nested RAID 1+0 instead.`,
          nodeId: a.id,
        });
    }
    return out;
  }

  // Mixed disk sizes in one array (soft): the larger disks are coerced down.
  //
  // Only mirror and parity coerce. md RAID 0 does NOT: create_strip_zones()
  // (raid0.c) lays a first strip zone across all devices up to the smallest, then
  // further zones over what is left of the larger ones — a striped or linear array
  // of mixed disks wastes nothing, and `capacityGB` already sums them. Warning
  // there would be telling the player something the panel itself contradicts.
  const COERCING = new Set(['mirror', 'parity1', 'parity2']);

  function checkMixedDiskSizes(tree, physical, ctx) {
    const out = [];
    for (const { node: a, label } of ctx.arrays) {
      if (!allDisks(a) || !COERCING.has(a.redundancy)) continue;
      const sizes = a.members.map((d) => d.sizeGB);
      const min = Math.min(...sizes);
      const max = Math.max(...sizes);
      if (min === max) continue;
      out.push({
        message: `${label} mixes disk sizes (${uniqSorted(sizes).join(', ')} TB). `
          + `Mirroring and parity coerce every member to the smallest, so each ${max} TB `
          + `disk contributes only ${min} TB and the remainder is unusable.`,
        nodeId: a.id,
      });
    }
    return out;
  }

  // Spans of unequal capacity under one parent (soft) — two different truths, so
  // two different messages:
  //   mirror parent  → the array keeps one copy's worth, i.e. the smallest span
  //                    (`capacityGB` takes the min); the excess is unusable.
  //   striped parent → md zones the leftover instead of dropping it (raid0.c
  //                    again), so no capacity is lost, but the tail of the volume
  //                    lives on fewer spans and is slower there.
  function checkUnevenSpans(tree, physical, ctx) {
    const out = [];
    for (const { node: a, label } of ctx.arrays) {
      if (!allArrays(a)) continue;
      const caps = a.members.map(Model.capacityGB);
      const min = Math.min(...caps);
      const max = Math.max(...caps);
      if (min === max) continue;
      out.push({
        message: a.redundancy === 'mirror'
          ? `${label} mirrors spans of unequal size (${fmt(min)} vs ${fmt(max)} TB usable). `
            + `A mirror holds one copy's worth, so it is limited to the smallest span.`
          : `${label} stripes over spans of unequal size (${fmt(min)} vs ${fmt(max)} TB usable). `
            + `No capacity is lost, but the tail of the volume is striped over fewer spans, `
            + `so throughput drops there.`,
        nodeId: a.id,
      });
    }
    return out;
  }

  // Soft, and DORMANT in v1: members of a span should span different backplanes.
  // v1 has a single backplane node (the diversity module is deferred, §9.4), so
  // this can never fire yet. Registered + documented so the §6 rule is visible and
  // wired for when the backplane-diversity module lands — not faked.
  function checkBackplaneDiversity(/* tree, physical, ctx */) {
    return null;
  }

  // ---------------------------------------------------------------------------
  // RULE REGISTRY
  //
  // `layer` says which axis a rule reasons about: 'data' reads the tree only,
  // 'physical' the derived physical view only, 'cross' genuinely needs both.
  // It is what lets a consumer ask for one axis' verdict (a challenge that only
  // grades the build, a future per-panel display) without re-deriving the split.
  // Rules that read the tree are skipped outright when there is no tree.
  // ---------------------------------------------------------------------------

  /** @type {{ code: string, severity: 'hard' | 'soft', layer: 'data' | 'physical' | 'cross', source: string,
   *             run: (tree: any, physical: any, ctx: any) => any }[]} */
  const RULES = [
    { code: 'min-disks',                 severity: 'hard', layer: 'data',
      source: 'raid-types §6',           run: checkMinDisks },

    { code: 'mixed-disk-sizes',          severity: 'soft', layer: 'data',
      source: 'domain-model §6',         run: checkMixedDiskSizes },

    { code: 'uneven-spans',              severity: 'soft', layer: 'data',
      source: 'domain-model §6 (md raid0.c)', run: checkUnevenSpans },

    { code: 'cross-axis-near-far-offset', severity: 'hard', layer: 'cross',
      source: 'cross-axis §6/§9.7',      run: checkCrossAxisLayout },

    { code: 'backplane-diversity',       severity: 'soft', layer: 'cross',
      source: 'diversity §9.4',          run: checkBackplaneDiversity },

    { code: 'nvme-backplane',            severity: 'hard', layer: 'physical',
      source: 'protocolli-dischi.md §6', run: checkNvmeBackplane },

    { code: 'engine-single-point',       severity: 'hard', layer: 'physical',
      source: 'RIEPILOGO image §6',      run: checkEngineSinglePoint },
  ];

  // ---------------------------------------------------------------------------
  // ENTRY
  // ---------------------------------------------------------------------------

  /**
   * Run every registered rule over the build.
   *
   * Dedup is by (code, nodeId): the same rule firing twice on the same node is
   * one fact stated twice, and the panel shows the message verbatim. Two
   * different nodes stay two violations — which is why the compiled tree
   * carries the canvas id (see Model.array).
   */
  /**
   * @param {ArrayNode | null} tree      the compiled build, or null (physical rules still run)
   * @param {Partial<PhysicalView>} [physical]  the derived physical view (physical.js buildView)
   * @param {{ levels?: Levels | null }} [opts]
   * @returns {Violations}
   */
  function validate(tree, physical = {}, opts = {}) {
    const levels = opts.levels || null;
    const ctx = {
      arrays: tree ? walkArrays(tree, [], []) : [],   // [{ node, label }]
      levels,                                          // the level catalogue (minimums, names)
      // Recognized once here rather than per rule: the phase-2b physical rules
      // (fake RAID is limited to 0/1/5/10, …) all need the level, and a rule
      // deriving it on its own could disagree with the panel.
      level: tree ? Model.recognize(tree, levels) : null,
    };

    const seen = new Set();
    const flat = /** @type {Violation[]} */ ([]);

    for (const rule of RULES) {
      if (rule.layer !== 'physical' && !tree) continue;

      const found = rule.run(tree, physical, ctx);
      if (!found) continue;

      for (const f of (Array.isArray(found) ? found : [found])) {
        if (!f) continue;
        const nodeId = f.nodeId ?? null;
        const key    = `${rule.code} ${nodeId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        flat.push({
          code:     rule.code,
          severity: rule.severity,
          layer:    rule.layer,
          message:  f.message,
          nodeId,
          source:   rule.source,
        });
      }
    }

    return {
      hard: flat.filter((v) => v.severity === 'hard'),
      soft: flat.filter((v) => v.severity === 'soft'),
    };
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  const RaidValidator = { validate, RULES };

  if (typeof module !== 'undefined' && module.exports) module.exports = RaidValidator;
  else root.RaidValidator = RaidValidator;

})(typeof globalThis !== 'undefined' ? globalThis : this);
