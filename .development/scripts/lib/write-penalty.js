/**
 * write-penalty.js — recover the SEQUENTIAL write penalty from `performance()`.
 *
 * model.js reports the random penalty as a number (`performance().writePenalty`)
 * and the sequential one only through `sequential.writeMult`, which is
 * parallelism ÷ penalty rounded to two decimals. Both the knowledge-base
 * generator and the test that checks `reference.writePenalty` against the engine
 * need the second number, so the division back lives here once instead of in
 * both — and neither of them restates the engine's mode table, which is a domain
 * fact and belongs to the engine alone (ADR-002).
 *
 * The guard is the point: a value that does not come back a whole number is a
 * rounding artefact, not a count of I/Os, and is refused rather than printed.
 *
 *   sequentialPenalty(Model.performance(tree))  → 1 | 2 | …
 */

'use strict';

/**
 * @param {{ parallelism: number, sequential: { writeMult: number } }} perf
 * @param {string} [where]  a label for the error message
 * @returns {number}
 */
function sequentialPenalty(perf, where = 'sequential write penalty') {
  if (!perf || !perf.sequential || !perf.sequential.writeMult)
    throw new Error(`${where}: the engine reports no sequential write multiplier`);
  const raw = perf.parallelism / perf.sequential.writeMult;
  const whole = Math.round(raw);
  if (whole < 1 || Math.abs(raw - whole) > 0.02)
    throw new Error(`${where}: does not come back a whole number (${raw})`);
  return whole;
}

module.exports = { sequentialPenalty };
