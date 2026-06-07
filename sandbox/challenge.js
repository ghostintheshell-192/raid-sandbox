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

  const METRIC_LABEL = {
    faultTolerance: 'Fault tolerance',
    capacityGB:     'Usable capacity',
    readClass:      'Read performance',
    writeClass:     'Write performance',
  };
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
      const actual = analysis ? analysis[req.metric] : undefined;
      const met    = analysis != null && actual !== undefined && meets(actual, req.op, req.value);
      return { ...req, actual, met, label: describe(req) };
    });

    const blockedBy = violations.hard || [];
    const satisfied = analysis != null
      && requirements.length > 0
      && requirements.every((r) => r.met)
      && blockedBy.length === 0;

    return { satisfied, requirements, blockedBy };
  }

  // ---- browser-only loaders (mirror kb.js:loadYaml) -------------------------
  function loadYaml(path) {
    return fetch(path)
      .then((res) => { if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`); return res.text(); })
      .then((txt) => root.jsyaml.load(txt));
  }
  const loadIndex     = ()   => loadYaml('../data/challenges/index.yaml');
  const loadChallenge = (id) => loadYaml(`../data/challenges/${id}.yaml`);

  const RaidChallenge = { checkChallenge, loadIndex, loadChallenge };

  if (typeof module !== 'undefined' && module.exports) module.exports = RaidChallenge;
  else root.RaidChallenge = RaidChallenge;

})(typeof globalThis !== 'undefined' ? globalThis : this);
