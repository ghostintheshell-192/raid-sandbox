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
 *     message,                    // player-facing "why it's invalid"
 *     nodeId:  string|null,       // which array/disk, for future UI highlighting
 *     source,                     // carta §6 citation
 *   }
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

  const mk = (code, severity, message, nodeId, source) =>
    ({ code, severity, message, nodeId: nodeId ?? null, source });

  // ---------------------------------------------------------------------------
  // CONSTRAINT CHECKS (§6) — each independent, reads like the §6 table.
  // A check returns Violation | Violation[] | null.
  // ---------------------------------------------------------------------------

  // Level-specific disk minimums (RAID 0/JBOD's ≥2 is structural → _firstIssue).
  const MIN_DISKS = {
    'striped|parity1': 3,   // RAID 5
    'striped|parity2': 4,   // RAID 6
    'striped|mirror':  4,   // RAID 10 (flat)
    'linear|mirror':   2,   // RAID 1
  };
  const LEVEL_NAME = {
    'striped|parity1': 'RAID 5',
    'striped|parity2': 'RAID 6',
    'striped|mirror':  'RAID 10',
    'linear|mirror':   'RAID 1',
  };

  function checkMinDisks(tree) {
    const out = [];
    for (const a of arrays(tree)) {
      if (!allDisks(a)) continue;                     // nested levels checked via their leaf spans
      const key = `${a.segmentation}|${a.redundancy}`;
      const min = MIN_DISKS[key];
      if (min && a.members.length < min)
        out.push(mk('min-disks', 'hard',
          `${LEVEL_NAME[key]} needs at least ${min} disks (this array has ${a.members.length}).`,
          a.id, 'raid-types §6'));
    }
    return out;
  }

  function checkMirrorEven(tree) {
    const out = [];
    for (const a of arrays(tree)) {
      if (allDisks(a) && a.segmentation === 'striped' && a.redundancy === 'mirror'
          && a.members.length % 2 !== 0)
        out.push(mk('mirror-even', 'hard',
          `A striped mirror needs an even disk count to pair into 2 copies — ${a.members.length} is odd `
          + `(that's the niche RAID 1E, not RAID 10).`,
          a.id, 'distribuzione-segmenti-algoritmi.md §6'));
    }
    return out;
  }

  // NVMe bypasses the backplane (and controller). In v1 cpAutoRoute enforces this
  // by construction (NVMe → PCIe); the check is a real guard against a routing
  // regression and is unit-testable on its own.
  function checkNvmeBackplane(physical) {
    const out = [];
    for (const r of physical.diskRoutes || []) {
      if (r.protocol === 'NVMe' && r.target === 'backplane')
        out.push(mk('nvme-backplane', 'hard',
          'NVMe drives talk straight to the PCIe bus — they bypass the backplane.',
          r.id, 'protocolli-dischi.md §6'));
    }
    return out;
  }

  // The RAID engine must sit at exactly one point on the path. Zero engines is
  // "incomplete" (already reported by _recognizePhysicalLayer) — only >1 is a
  // violation here, so the two never double-report.
  function checkEngineSinglePoint(physical) {
    if ((physical.engineCount || 0) > 1)
      return mk('engine-single-point', 'hard',
        'The RAID engine can sit at only one point on the path — you have more than one '
        + '(e.g. a hardware controller and a separate RAID engine).',
        null, 'RIEPILOGO image §6');
    return null;
  }

  // Cross-axis (§6, §9.7): near/far/offset are mdadm layouts — they only exist under
  // Linux software RAID. On hardware/fake build a nested RAID 1+0; Windows Storage
  // Spaces uses its own column/copy scheme. Only fires when the control path is
  // DETERMINED and incompatible (an unbuilt path is the recognizer's job, not ours).
  const MDADM_LAYOUTS = new Set(['near', 'far', 'offset']);

  function checkCrossAxisLayout(tree, physical) {
    if (!physical.raidType) return null;              // path not determined yet → don't nag
    const linuxSoftware = physical.raidType === 'software' && physical.os === 'os-linux';
    if (linuxSoftware) return null;
    const out = [];
    for (const a of arrays(tree)) {
      if (MDADM_LAYOUTS.has(a.algorithm))
        out.push(mk('cross-axis-near-far-offset', 'hard',
          `The "${a.algorithm}" layout only exists under Linux software RAID (mdadm). `
          + `On ${physical.raidType} RAID, build a nested RAID 1+0 instead.`,
          a.id, 'cross-axis §6/§9.7'));
    }
    return out;
  }

  // Soft, and DORMANT in v1: members of a span should span different backplanes.
  // v1 has a single backplane node (the diversity module is deferred, §9.4), so
  // this can never fire yet. Registered + documented so the §6 rule is visible and
  // wired for when the backplane-diversity module lands — not faked.
  function checkBackplaneDiversity(/* tree, physical */) {
    return null;
  }

  // ---------------------------------------------------------------------------
  // ENTRY
  // ---------------------------------------------------------------------------

  function validate(tree, physical = {}) {
    const found = [];
    if (tree) {
      found.push(...checkMinDisks(tree));
      found.push(...checkMirrorEven(tree));
      found.push(...(checkCrossAxisLayout(tree, physical) || []));
      found.push(checkBackplaneDiversity(tree, physical));
    }
    found.push(...checkNvmeBackplane(physical));
    found.push(checkEngineSinglePoint(physical));

    const flat = found.filter(Boolean);
    return {
      hard: flat.filter((v) => v.severity === 'hard'),
      soft: flat.filter((v) => v.severity === 'soft'),
    };
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  const RaidValidator = { validate };

  if (typeof module !== 'undefined' && module.exports) module.exports = RaidValidator;
  else root.RaidValidator = RaidValidator;

})(typeof globalThis !== 'undefined' ? globalThis : this);
