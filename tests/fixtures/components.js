/**
 * fixtures/components.js — the component catalogue MANIFEST, as the headless tests
 * see it.
 *
 * The truth is `data/components/index.yaml` + the component files it lists. The
 * headless suites are zero-dependency and Node has no YAML parser, so they get
 * this JS mirror instead — and `components-data.test.js` (python3 + pyyaml, the
 * repo's YAML reader) asserts that the mirror and the YAML agree on every MODEL
 * field: ids and their order, `provides`, `ports` (dir, type, accepts) and
 * `portTypes`. UI fields (icon, colour, label, badge, descriptions) are not
 * mirrored: nothing headless reads them.
 *
 * Edit the YAML first, then this file; a mismatch is a failing test, not a
 * silent split between the browser and Node (tech-debt/ports-double-source-of-truth.md).
 */

module.exports = {
  components: [
    { id: 'backplane',
      provides: ['passive-routing'],
      ports: [{ id: 'in',  dir: 'in',  type: 'block-storage', accepts: ['SATA', 'SAS'] },
              { id: 'out', dir: 'out', type: 'routing' }] },

    { id: 'hba',
      provides: ['protocol-translation', 'pcie-connection'],
      ports: [{ id: 'in',  dir: 'in',  type: 'routing' },
              { id: 'out', dir: 'out', type: 'pcie' }] },

    { id: 'engine-roc',
      provides: ['protocol-translation', 'raid-engine', 'virtual-drive'],
      ports: [{ id: 'in',  dir: 'in',  type: 'routing' },
              { id: 'out', dir: 'out', type: 'virtual-drive' }] },

    { id: 'engine-metadata',
      provides: ['raid-engine'],
      ports: [{ id: 'in',  dir: 'in',  type: 'pcie' },
              { id: 'out', dir: 'out', type: 'pcie' }] },

    { id: 'os-linux',
      provides: ['raid-engine', 'software-raid'],
      ports: [{ id: 'in',  dir: 'in',  type: 'cpu' }] },

    { id: 'os-windows',
      provides: ['raid-engine', 'software-raid'],
      ports: [{ id: 'in',  dir: 'in',  type: 'cpu' }] },

    { id: 'pcie',
      provides: ['pcie-connection'],
      ports: [{ id: 'in',  dir: 'in',  type: 'pcie', accepts: ['NVMe'] },
              { id: 'out', dir: 'out', type: 'pcie' }] },

    { id: 'cpu',
      provides: ['cpu-execution'],
      ports: [{ id: 'in',  dir: 'in',  type: 'pcie' },
              { id: 'out', dir: 'out', type: 'cpu' }] },
  ],

  portTypes: {
    'block-storage': { connectsTo: [] },
    'routing':       { connectsTo: ['routing'] },
    'pcie':          { connectsTo: ['pcie'] },
    'virtual-drive': { connectsTo: ['pcie'] },
    'cpu':           { connectsTo: ['cpu'] },
  },
};
