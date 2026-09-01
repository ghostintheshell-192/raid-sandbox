/**
 * data-loader.js — RAID Sandbox: fetch an indexed resource family (browser-only).
 *
 * Every resource family under data/ has the same shape: an index.yaml that names
 * the files, and one file per resource. This is the one place that fetches them.
 * It decides NOTHING about what the files mean: the caller says which files the
 * index names (`filesOf`) and hands the parsed objects to the engine's own
 * assembler (`assemble`) — the same function the headless data tests use, so
 * what the browser builds is what the tests checked (the first catalogue loader
 * assembled by hand and dropped a field the tests never saw; 2026-09-02).
 *
 *   loadIndexed(basePath, filesOf, assemble) → Promise<manifest>
 *     filesOf(index)              → [{ key, file }]   which files to fetch, keyed how assemble wants them
 *     assemble(index, filesByKey) → manifest          the engine's assembler (RaidCatalog.assemble, RaidLevels.assemble)
 *
 * Rejects on any failure, naming the file. There is no fallback: a page drawn
 * from a stale table would disagree with the engine that reads the data.
 * Never loaded in Node.
 */

(function (root) {
  'use strict';

  function loadYaml(path) {
    return fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
        return res.text();
      })
      .then((txt) => root.jsyaml.load(txt));
  }

  function loadIndexed(basePath, filesOf, assemble) {
    const base = basePath.replace(/\/$/, '');
    return loadYaml(`${base}/index.yaml`).then((index) =>
      Promise.all(filesOf(index).map(({ key, file }) =>
        loadYaml(`${base}/${file}`).then((def) => [key, def])
      )).then((pairs) => {
        const files = {};
        for (const [key, def] of pairs) files[key] = def;
        return assemble(index, files);
      })
    );
  }

  root.DataLoader = { loadYaml, loadIndexed };

})(typeof globalThis !== 'undefined' ? globalThis : this);
