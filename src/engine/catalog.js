/**
 * catalog.js — RAID Sandbox: the component catalogue (physical-model data, indexed).
 *
 * PURE and headless, and it knows nothing about RAID: this is the generic half of
 * spec §5a. A catalogue is built from a MANIFEST — the parsed contents of
 * `data/components/index.yaml` plus every component file it lists — and answers
 * the questions the engine and the physical canvas ask about components:
 *
 *   - which ports a component has, of which type and direction;
 *   - whether an output port of type X may be wired into an input port of type Y;
 *   - which components accept an atom (a disk) of protocol P, and on which port;
 *   - which capabilities a component declares (`provides`).
 *
 * It does NOT decide what any of this MEANS — that a `raid-engine` on the path
 * makes the build hardware RAID is the recognizer's reading (physical.js) — and
 * it never reads files: the browser fetches the YAML and hands the parsed objects
 * in; the headless tests hand in a fixture that `tests/components-data.test.js`
 * keeps aligned with the YAML, so the two environments cannot drift apart in
 * silence (tech-debt/ports-double-source-of-truth.md).
 *
 *   createCatalog(manifest) → Catalog          // throws on a malformed manifest
 *
 *   manifest = {
 *     components: [{ id, provides?: [cap, …], ports: [Port, …], ui?: {…}, … }, …],
 *     portTypes:  { type: { connectsTo: [type, …] }, … },
 *   }
 *   Port = { id, dir: 'in' | 'out', type, accepts?: [protocol, …] }   // accepts: inputs only
 *
 * The port relation is DIRECTIONAL: `portTypes[out].connectsTo` lists the input
 * types an output of that type may feed, and nothing is implied in reverse. The
 * check this replaces (`portsCompatible` in physical-controller.js) accepted a
 * pair if EITHER side listed the other, which let a wire form that the declared
 * data flow does not describe.
 */

(function (root) {
  'use strict';

  const fail = (msg) => { throw new Error(`catalog: ${msg}`); };

  // ---------------------------------------------------------------------------
  // VALIDATION — fail fast, name the offending piece.
  // ---------------------------------------------------------------------------

  function validate(manifest) {
    if (!manifest || typeof manifest !== 'object') fail('manifest must be an object');
    const { components, portTypes } = manifest;
    if (!Array.isArray(components)) fail('manifest.components must be a list');
    if (!portTypes || typeof portTypes !== 'object' || Array.isArray(portTypes))
      fail('manifest.portTypes must be a map: type → { connectsTo: [type, …] }');

    for (const [type, spec] of Object.entries(portTypes)) {
      if (!spec || !Array.isArray(spec.connectsTo))
        fail(`portTypes.${type}: connectsTo must be a list`);
      for (const t of spec.connectsTo)
        if (!(t in portTypes)) fail(`portTypes.${type}: connectsTo names unknown type "${t}"`);
    }

    const seen = new Set();
    for (const def of components) {
      if (!def || typeof def.id !== 'string' || !def.id) fail('a component has no id');
      if (seen.has(def.id)) fail(`duplicate component id "${def.id}"`);
      seen.add(def.id);
      if (!Array.isArray(def.ports)) fail(`${def.id}: ports must be a list`);
      if (def.provides !== undefined && !Array.isArray(def.provides))
        fail(`${def.id}: provides must be a list`);

      const portIds = new Set();
      for (const p of def.ports) {
        if (!p || typeof p.id !== 'string') fail(`${def.id}: a port has no id`);
        if (portIds.has(p.id)) fail(`${def.id}: duplicate port id "${p.id}"`);
        portIds.add(p.id);
        if (p.dir !== 'in' && p.dir !== 'out') fail(`${def.id}.${p.id}: dir must be 'in' or 'out'`);
        if (typeof p.type !== 'string' || !(p.type in portTypes))
          fail(`${def.id}.${p.id}: port type "${p.type}" is not declared in portTypes`);
        if (p.accepts !== undefined) {
          if (!Array.isArray(p.accepts)) fail(`${def.id}.${p.id}: accepts must be a list`);
          if (p.dir !== 'in') fail(`${def.id}.${p.id}: only an input port can accept atoms`);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // CATALOGUE
  // ---------------------------------------------------------------------------

  /**
   * Index a validated manifest. The returned object is read-only in intent: the
   * engine and the canvas ask it questions, nobody writes to it.
   */
  function createCatalog(manifest) {
    validate(manifest);

    const byId = new Map(manifest.components.map((def) => [def.id, def]));
    const portTypes = manifest.portTypes;

    const ids  = () => Array.from(byId.keys());
    const has  = (id) => byId.has(id);
    const get  = (id) => byId.get(id) || null;

    const portsOf  = (id) => (byId.get(id) || { ports: [] }).ports;
    const portOf   = (id, portId) => portsOf(id).find((p) => p.id === portId) || null;
    const provides = (id) => (byId.get(id) || {}).provides || [];

    /** Input types an output port of `outType` may feed (empty for an unknown type). */
    const connectsTo = (outType) => (portTypes[outType] || { connectsTo: [] }).connectsTo;

    /**
     * Every (component, input port) that accepts an atom of `protocol` — ALL of
     * them, in manifest order, so an ambiguity is the caller's to handle rather
     * than hidden behind a first match (same stance as graph.nodesWith).
     */
    function acceptorsOf(protocol) {
      const out = [];
      for (const def of byId.values())
        for (const p of def.ports)
          if (p.dir === 'in' && Array.isArray(p.accepts) && p.accepts.includes(protocol))
            out.push({ componentId: def.id, portId: p.id });
      return out;
    }

    /**
     * May `fromId.fromPort` (an output) be wired into `toId.toPort` (an input)?
     * Returns { ok: true } or { ok: false, reason } — the reason is written for a
     * developer or a test, not for the player (the canvas simply does not let
     * an impossible wire form).
     */
    function canConnect(fromId, fromPort, toId, toPort) {
      const no = (reason) => ({ ok: false, reason });
      if (!has(fromId)) return no(`unknown component "${fromId}"`);
      if (!has(toId))   return no(`unknown component "${toId}"`);
      const a = portOf(fromId, fromPort);
      const b = portOf(toId, toPort);
      if (!a) return no(`${fromId} has no port "${fromPort}"`);
      if (!b) return no(`${toId} has no port "${toPort}"`);
      if (a.dir !== 'out') return no(`${fromId}.${fromPort} is not an output port`);
      if (b.dir !== 'in')  return no(`${toId}.${toPort} is not an input port`);
      if (!connectsTo(a.type).includes(b.type))
        return no(`a "${a.type}" output cannot feed a "${b.type}" input (${fromId}.${fromPort} → ${toId}.${toPort})`);
      return { ok: true };
    }

    // `roles` is the manifest's reading guide for the recognizer (which
    // capability marks the end of the path, how to name it); the catalogue
    // carries it, the recognizer interprets it.
    return { ids, has, get, portsOf, portOf, provides, connectsTo, acceptorsOf, canConnect,
             roles: manifest.roles || {}, manifest };
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  const RaidCatalog = { createCatalog };

  if (typeof module !== 'undefined' && module.exports) module.exports = RaidCatalog;
  else root.RaidCatalog = RaidCatalog;

})(typeof globalThis !== 'undefined' ? globalThis : this);
