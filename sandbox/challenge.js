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

  const isAnySpec = (spec) => spec === 'any' || spec == null;

  function checkChallenge(challenge, evalResult) {
    const analysis   = evalResult && evalResult.analysis;
    const violations = (evalResult && evalResult.violations) || { hard: [], soft: [] };
    const reqs       = (challenge && challenge.requirements) || {};

    // One row per metric in the vocabulary — `requirements` is a complete record,
    // so the checker always reads something for every dimension. 'any' = unconstrained.
    const requirements = Object.keys(METRIC_LABEL).map((metric) => {
      const spec   = reqs[metric];
      const actual = analysis ? analysis[metric] : undefined;
      if (isAnySpec(spec))
        return { metric, isAny: true, op: 'any', value: 'any', actual, met: true,
                 label: `${METRIC_LABEL[metric]}: any` };
      const met = analysis != null && actual !== undefined && meets(actual, spec.op, spec.value);
      return { metric, isAny: false, op: spec.op, value: spec.value, actual, met,
               label: describe({ metric, op: spec.op, value: spec.value }) };
    });

    const blockedBy = violations.hard || [];
    const satisfied = analysis != null
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
    if (!ch.id)     problems.push('missing id');
    if (!ch.title)  problems.push('missing title');
    if (!ch.prompt) problems.push('missing prompt');

    const reqs = ch.requirements;
    if (!reqs || typeof reqs !== 'object' || Array.isArray(reqs)) {
      problems.push('requirements must be a map: metric → ("any" | { op, value })');
      return problems;
    }
    // Completeness: EVERY vocabulary metric must be present (use "any" if unconstrained),
    // and no foreign keys — so the checker always reads a value for every dimension.
    for (const m of KNOWN_METRICS)
      if (!(m in reqs)) problems.push(`missing requirement for "${m}" (use "any" if unconstrained)`);
    for (const m of Object.keys(reqs))
      if (!KNOWN_METRICS.has(m)) problems.push(`unknown metric "${m}"`);

    let realConstraints = 0;
    for (const m of Object.keys(reqs)) {
      if (!KNOWN_METRICS.has(m)) continue;
      const spec = reqs[m];
      if (isAnySpec(spec)) continue;
      if (typeof spec !== 'object' || Array.isArray(spec)) { problems.push(`${m}: must be "any" or { op, value }`); continue; }
      realConstraints++;
      if (!KNOWN_OPS.has(spec.op)) problems.push(`${m}: unknown op "${spec.op}"`);
      if (spec.value === undefined || spec.value === null) problems.push(`${m}: missing value`);
      if (spec.op === 'in' && !Array.isArray(spec.value)) problems.push(`${m}: 'in' needs a list value`);
      if (spec.op && spec.op !== 'in' && Array.isArray(spec.value)) problems.push(`${m}: '${spec.op}' needs a scalar value`);
    }
    if (realConstraints === 0) problems.push('a challenge needs at least one real (non-"any") requirement');
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
