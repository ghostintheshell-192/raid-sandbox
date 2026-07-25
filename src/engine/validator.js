/**
 * validator.js — RAID Sandbox: the constraint engine (Phase 5, Stage C).
 *
 * PURE and headless: takes plain data (the compiled RaidModel tree + a derived
 * physical view), returns the §6 constraint violations. No DOM, no canvas state.
 * This is what makes it testable in Node and reusable by checkChallenge (Stage D).
 *
 *   validate(tree, physical) → { hard: Violation[], soft: Violation[] }   // never null
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

(function (root) {
  'use strict';

  const Model = (typeof require !== 'undefined') ? require('./model.js') : root.RaidModel;

  const isDisk   = (n) => n && n.kind === 'disk';
  const isArray  = (n) => n && n.kind === 'array';
  const allDisks = (a) => a.members.length > 0 && a.members.every(isDisk);

  /** Collect every array node in the tree (depth-first). */
  function arrays(node, acc = []) {
    if (isArray(node)) { acc.push(node); node.members.forEach((m) => arrays(m, acc)); }
    return acc;
  }

  // ---------------------------------------------------------------------------
  // CONSTRAINT CHECKS (§6) — each independent, reads like the §6 table.
  // A check returns Finding | Finding[] | null, where Finding = { message, nodeId? }.
  // Code, severity, layer and source come from the registry entry, not from here.
  // ---------------------------------------------------------------------------

  // Level-specific disk minimums (RAID 0/JBOD's ≥2 is structural → _firstIssue).
  // striped|mirror splits by parity of the disk count: EVEN is RAID 10 (≥4), ODD is
  // RAID 1E (≥3) — both valid, just different minimums. (An odd striped mirror used
  // to be flagged as an error; it is now the recognized RAID 1E level.)
  const MIN_DISKS = {
    'striped|parity1': 3,   // RAID 5
    'striped|parity2': 4,   // RAID 6
    'linear|mirror':   2,   // RAID 1
  };
  const LEVEL_NAME = {
    'striped|parity1': 'RAID 5',
    'striped|parity2': 'RAID 6',
    'linear|mirror':   'RAID 1',
  };

  function checkMinDisks(tree, physical, ctx) {
    const out = [];
    for (const a of ctx.arrays) {
      if (!allDisks(a)) continue;                     // nested levels checked via their leaf spans
      let min, name;
      if (a.segmentation === 'striped' && a.redundancy === 'mirror') {
        const odd = a.members.length % 2 !== 0;
        min  = odd ? 3 : 4;                            // RAID 1E (odd) vs RAID 10 (even)
        name = odd ? 'RAID 1E' : 'RAID 10';
      } else {
        const key = `${a.segmentation}|${a.redundancy}`;
        min = MIN_DISKS[key];
        name = LEVEL_NAME[key];
      }
      if (min && a.members.length < min)
        out.push({
          message: `${name} needs at least ${min} disks (this array has ${a.members.length}).`,
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
    for (const a of ctx.arrays) {
      if (MDADM_LAYOUTS.has(a.algorithm))
        out.push({
          message: `The "${a.algorithm}" layout only exists under Linux software RAID (mdadm). `
            + `On ${physical.raidType} RAID, build a nested RAID 1+0 instead.`,
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

  const RULES = [
    { code: 'min-disks',                 severity: 'hard', layer: 'data',
      source: 'raid-types §6',           run: checkMinDisks },

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
  function validate(tree, physical = {}) {
    const ctx = {
      arrays: tree ? arrays(tree) : [],
      // Recognized once here rather than per rule: the phase-2b physical rules
      // (fake RAID is limited to 0/1/5/10, …) all need the level, and a rule
      // deriving it on its own could disagree with the panel.
      level: tree ? Model.recognize(tree) : null,
    };

    const seen = new Set();
    const flat = [];

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
