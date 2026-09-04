/**
 * catalog.test.js — headless tests for the component catalogue (engine/catalog.js).
 * Run with: node catalog.test.js
 *
 * The catalogue is domain-free, so these tests use a made-up manifest: two port
 * types, three components. The REAL manifest is exercised by
 * components-data.test.js (against the YAML) and by canvas-state.test.js
 * (through the fixture).
 */

const { createCatalog } = require('../src/engine/catalog.js');
const { test, assert, eq, finish } = require('./test-helpers.js');

const manifest = () => ({
  components: [
    { id: 'source', provides: ['feed'],
      ports: [{ id: 'in', dir: 'in', type: 'atom', accepts: ['X'] },
              { id: 'out', dir: 'out', type: 'a' }] },
    { id: 'relay',
      ports: [{ id: 'in', dir: 'in', type: 'a' }, { id: 'out', dir: 'out', type: 'b' }] },
    { id: 'sink', provides: ['end'],
      ports: [{ id: 'in', dir: 'in', type: 'b' }] },
  ],
  portTypes: {
    atom: { connectsTo: [] },
    a:    { connectsTo: ['a'] },
    b:    { connectsTo: ['b'] },
  },
});

// ---------------------------------------------------------------------------
console.log('\n[1] a well-formed manifest indexes');

test('ids come back in manifest order', () => {
  const c = createCatalog(manifest());
  eq(c.ids().join(','), 'source,relay,sink');
  assert(c.has('relay') && !c.has('nope'));
  eq(c.get('nope'), null);
});

test('ports, provides and the port relation are readable', () => {
  const c = createCatalog(manifest());
  eq(c.portsOf('relay').length, 2);
  eq(c.portOf('relay', 'out').type, 'b');
  eq(c.portOf('relay', 'zzz'), null);
  eq(c.provides('source').join(','), 'feed');
  eq(c.provides('relay').length, 0);            // undeclared → empty, never undefined
  eq(c.connectsTo('a').join(','), 'a');
  eq(c.connectsTo('unknown').length, 0);
});

test('providersOf reads the provides relation backwards, in manifest order', () => {
  const m = manifest();
  m.components[2].provides = ['end', 'feed'];   // two claimants for the same capability
  const c = createCatalog(m);
  eq(c.providersOf('feed').join(','), 'source,sink');
  eq(c.providersOf('end').join(','), 'sink');
  eq(c.providersOf('nobody-claims-this').length, 0);   // unclaimed → empty, never undefined
});

test('acceptorsOf lists every (component, port) that accepts the protocol', () => {
  const c = createCatalog(manifest());
  const acc = c.acceptorsOf('X');
  eq(acc.length, 1);
  eq(acc[0].componentId, 'source');
  eq(acc[0].portId, 'in');
  eq(c.acceptorsOf('Y').length, 0);
});

// ---------------------------------------------------------------------------
console.log('\n[2] canConnect is directional and names its reason');

test('a matching out → in pair connects', () => {
  const c = createCatalog(manifest());
  eq(c.canConnect('source', 'out', 'relay', 'in').ok, true);
});

test('the relation is not symmetric: b → a is refused even though a → a holds', () => {
  const c = createCatalog(manifest());
  const r = c.canConnect('relay', 'out', 'relay', 'in');   // b out → a in
  eq(r.ok, false);
  assert(/"b" output cannot feed a "a" input/.test(r.reason), r.reason);
});

test('an input cannot be the source, an output cannot be the target', () => {
  const c = createCatalog(manifest());
  assert(/not an output port/.test(c.canConnect('relay', 'in', 'sink', 'in').reason));
  assert(/not an input port/.test(c.canConnect('source', 'out', 'relay', 'out').reason));
});

test('unknown components and ports are named in the reason', () => {
  const c = createCatalog(manifest());
  assert(/unknown component "ghost"/.test(c.canConnect('ghost', 'out', 'sink', 'in').reason));
  assert(/relay has no port "side"/.test(c.canConnect('relay', 'side', 'sink', 'in').reason));
});

// ---------------------------------------------------------------------------
console.log('\n[3] a malformed manifest fails fast, naming the piece');

const failsWith = (mutate, re) => {
  const m = manifest();
  mutate(m);
  let err = null;
  try { createCatalog(m); } catch (e) { err = e; }
  assert(err, 'expected createCatalog to throw');
  assert(re.test(err.message), err.message);
};

test('a port type not declared in portTypes', () =>
  failsWith((m) => { m.components[1].ports[1].type = 'c'; }, /relay\.out: port type "c"/));

test('connectsTo naming an unknown type', () =>
  failsWith((m) => { m.portTypes.a.connectsTo.push('zzz'); }, /portTypes\.a: connectsTo names unknown type "zzz"/));

test('a duplicate component id', () =>
  failsWith((m) => { m.components.push({ id: 'sink', ports: [] }); }, /duplicate component id "sink"/));

test('accepts on an output port', () =>
  failsWith((m) => { m.components[1].ports[1].accepts = ['X']; }, /relay\.out: only an input port can accept/));

test('a port with a bad direction', () =>
  failsWith((m) => { m.components[2].ports[0].dir = 'both'; }, /sink\.in: dir must be/));

test('a component without a ports list', () =>
  failsWith((m) => { delete m.components[0].ports; }, /source: ports must be a list/));

finish();
