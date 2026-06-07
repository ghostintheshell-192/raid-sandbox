/**
 * test-helpers.js — shared test harness for all Node-runnable test files.
 * Usage: const { test, assert, eq, finish } = require('./test-helpers.js');
 */

let passed = 0, failed = 0;

function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (e) { console.error(`  ✗ ${label}`); console.error(`    ${e.stack || e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b) { assert(a === b, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function finish() {
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

module.exports = { test, assert, eq, finish };
