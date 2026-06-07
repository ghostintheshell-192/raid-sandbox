/**
 * challenge.js — RAID Sandbox: prompt-mode win-check (Phase 5, Stage D).
 *
 * The challenge model is REQUIREMENT-SATISFACTION (carta §9.6): a challenge states
 * requirements over DERIVED outcomes (faultTolerance, capacityGB, readClass,
 * writeClass) and ANY topology meeting them wins — there is no "one right level".
 *
 * checkChallenge() sits strictly ON TOP of evaluate(): it reads `analysis` (which
 * now includes Stage B's performance) and `violations` (Stage C) and composes them.
 * It adds zero logic to evaluate() itself — same loose-coupling discipline as the
 * rest of Phase 5.
 *
 *   checkChallenge(challenge, evalResult) → {
 *     satisfied,                 // all requirements met AND no hard violation
 *     requirements: [ { metric, op, value, actual, met, label } ],
 *     blockedBy: Violation[],    // hard violations: right numbers, illegal build ≠ a win
 *   }
 *
 * Loaders (browser-only) reuse kb.js's loadYaml pattern. They are never called in
 * Node — the headless tests exercise checkChallenge with inline fixtures.
 */

(function (root) {
  'use strict';

  // Compare a derived value against a single requirement.
  function meets(actual, op, value) {
    switch (op) {
      case '>=': return actual >= value;
      case '<=': return actual <= value;
      case '==': return actual === value;
      case 'in': return Array.isArray(value) && value.includes(actual);
      default:   return false;
    }
  }

  // The requirement vocabulary — the ONE place that says what a challenge may ask.
  // Every metric here must be a key returned by RaidModel.analyze(); validateChallenge()
  // rejects anything else, so a typo'd metric can never ship as a silently-unwinnable
  // challenge. Adding a metric = add it here AND in analyze().
  const METRIC_LABEL = {
    diskCount:      'Disks',
    rawCapacityGB:  'Raw capacity (TB)',
    capacityGB:     'Usable capacity (TB)',
    faultTolerance: 'Fault tolerance',
    readClass:      'Read performance',
    writeClass:     'Write performance',
  };
  const KNOWN_METRICS = new Set(Object.keys(METRIC_LABEL));
  const KNOWN_OPS     = new Set(['>=', '<=', '==', 'in']);
  const OP_TEXT = { '>=': '≥', '<=': '≤', '==': '=', in: 'is' };

  function describe(req) {
    const label = METRIC_LABEL[req.metric] || req.metric;
    const val   = Array.isArray(req.value) ? req.value.join(' / ') : req.value;
    return `${label} ${OP_TEXT[req.op] || req.op} ${val}`;
  }

  function checkChallenge(challenge, evalResult) {
    const analysis   = evalResult && evalResult.analysis;
    const violations = (evalResult && evalResult.violations) || { hard: [], soft: [] };
    const reqs       = (challenge && challenge.requirements) || [];

    const requirements = reqs.map((req) => {
      const known  = KNOWN_METRICS.has(req.metric);
      const actual = analysis ? analysis[req.metric] : undefined;
      const met    = known && analysis != null && actual !== undefined && meets(actual, req.op, req.value);
      return { ...req, actual, met, known, label: describe(req) };
    });

    const blockedBy = violations.hard || [];
    const satisfied = analysis != null
      && requirements.length > 0
      && requirements.every((r) => r.met)
      && blockedBy.length === 0;

    return { satisfied, requirements, blockedBy };
  }

  /**
   * Static validation of a challenge's data — the guard that lets challenges be
   * added without breaking the game. Returns a list of human-readable problems
   * (empty = valid). Used by the data test over every YAML, and safe to call at
   * load time. It checks shape + that every requirement uses a known metric/op,
   * so a malformed challenge fails loudly instead of becoming silently unwinnable.
   */
  function validateChallenge(ch) {
    const problems = [];
    if (!ch || typeof ch !== 'object') return ['challenge is not an object'];
    if (!ch.id)    problems.push('missing id');
    if (!ch.title) problems.push('missing title');
    if (!ch.prompt) problems.push('missing prompt');
    if (!Array.isArray(ch.requirements) || ch.requirements.length === 0) {
      problems.push('requirements must be a non-empty list');
    } else {
      ch.requirements.forEach((r, i) => {
        if (!KNOWN_METRICS.has(r.metric)) problems.push(`req[${i}]: unknown metric "${r.metric}"`);
        if (!KNOWN_OPS.has(r.op))         problems.push(`req[${i}]: unknown op "${r.op}"`);
        if (r.value === undefined || r.value === null) problems.push(`req[${i}]: missing value`);
        if (r.op === 'in' && !Array.isArray(r.value)) problems.push(`req[${i}]: 'in' needs a list value`);
        if (r.op && r.op !== 'in' && Array.isArray(r.value)) problems.push(`req[${i}]: '${r.op}' needs a scalar value`);
      });
    }
    return problems;
  }

  // ---- browser-only loaders (mirror kb.js:loadYaml) -------------------------
  function loadYaml(path) {
    return fetch(path)
      .then((res) => { if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`); return res.text(); })
      .then((txt) => root.jsyaml.load(txt));
  }
  const loadIndex     = ()   => loadYaml('../data/challenges/index.yaml');
  const loadChallenge = (id) => loadYaml(`../data/challenges/${id}.yaml`).then((ch) => {
    const problems = validateChallenge(ch);
    if (problems.length) console.warn(`Challenge "${id}" is malformed:`, problems);
    return ch;
  });

  const RaidChallenge = {
    checkChallenge, validateChallenge, KNOWN_METRICS, KNOWN_OPS,
    loadIndex, loadChallenge,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RaidChallenge;
  else root.RaidChallenge = RaidChallenge;

})(typeof globalThis !== 'undefined' ? globalThis : this);
