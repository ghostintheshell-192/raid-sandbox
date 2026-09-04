/**
 * fixtures/components.js — the component catalogue MANIFEST, as the headless tests
 * see it.
 *
 * The truth is `data/components/index.yaml` + the component files it lists. The
 * headless suites are zero-dependency and Node has no YAML parser, so they get
 * this JS mirror instead — and `components-data.test.js` (python3 + pyyaml, the
 * repo's YAML reader) asserts that the mirror and the YAML agree on every MODEL
 * field: ids and their order, `provides`, `ports` (dir, type, accepts),
 * `verdict`, `layouts`, and the manifest's `roles` and `portTypes`. UI fields (icon,
 * colour, label, badge, chip, tooltip, descriptions) are not mirrored: nothing
 * headless reads them — except `ui.label`/`ui.badge`, which the recognizer
 * uses to NAME a piece in its diagnostics, so those two are mirrored too.
 *
 * Edit the YAML first, then this file; a mismatch is a failing test, not a
 * silent split between the browser and Node (tech-debt/ports-double-source-of-truth.md).
 */

module.exports = {
  roles: {
    sink: { capability: 'os', label: 'OS', article: 'an' },
  },

  components: [
    { id: 'backplane',
      provides: ['passive-routing'],
      ui: { label: 'Backplane' },
      ports: [{ id: 'in',  dir: 'in',  type: 'block-storage', accepts: ['SATA', 'SAS'] },
              { id: 'out', dir: 'out', type: 'routing' }] },

    { id: 'hba',
      provides: ['protocol-translation', 'pcie-connection'],
      ui: { label: 'HBA' },
      ports: [{ id: 'in',  dir: 'in',  type: 'routing' },
              { id: 'out', dir: 'out', type: 'pcie' }] },

    { id: 'engine-roc',
      provides: ['protocol-translation', 'raid-engine', 'virtual-drive'],
      verdict: { raidType: 'hardware',
                 reason: 'The RAID engine is a RAID-on-Chip — it sits before the PCIe bus, builds the array itself, and the OS sees one virtual drive.' },
      ui: { label: 'RAID Engine', badge: 'RoC' },
      ports: [{ id: 'in',  dir: 'in',  type: 'routing' },
              { id: 'out', dir: 'out', type: 'virtual-drive' }] },

    { id: 'engine-roc-trimode',
      provides: ['protocol-translation', 'raid-engine', 'virtual-drive'],
      verdict: { raidType: 'hardware',
                 reason: 'The RAID engine is a tri-mode RAID-on-Chip — it takes SAS, SATA and NVMe drives directly, builds the array itself, and the OS sees one virtual drive.' },
      ui: { label: 'RAID Engine', badge: 'RoC tri-mode' },
      ports: [{ id: 'in',  dir: 'in',  type: 'routing', accepts: ['NVMe'] },
              { id: 'out', dir: 'out', type: 'virtual-drive' }] },

    { id: 'engine-metadata',
      provides: ['raid-engine'],
      verdict: { raidType: 'fake',
                 reason: 'The RAID engine is a metadata-only chip — it owns the array metadata, but the CPU still computes the parity, not the chip.' },
      ui: { label: 'RAID Engine', badge: 'metadata' },
      ports: [{ id: 'in',  dir: 'in',  type: 'pcie' },
              { id: 'out', dir: 'out', type: 'pcie' }] },

    { id: 'os-linux',
      provides: ['raid-engine', 'software-raid', 'os', 'layout:near', 'layout:far', 'layout:offset'],
      verdict: { raidType: 'software',
                 reason: 'No RAID engine sits on the path — Linux and the CPU compute the layout themselves, with no RAID hardware involved.' },
      layouts: { reason: '{label} uses the "{algorithm}" layout, which only exists under Linux software RAID (mdadm). On {raidType} RAID, build a nested RAID 1+0 instead.' },
      ui: { label: 'Linux' },
      ports: [{ id: 'in',  dir: 'in',  type: 'cpu' }] },

    { id: 'os-windows',
      provides: ['raid-engine', 'software-raid', 'os'],
      verdict: { raidType: 'software',
                 reason: 'No RAID engine sits on the path — Windows and the CPU compute the layout themselves, with no RAID hardware involved.' },
      ui: { label: 'Windows' },
      ports: [{ id: 'in',  dir: 'in',  type: 'cpu' }] },

    { id: 'pcie',
      provides: ['pcie-connection'],
      ui: { label: 'PCIe bus' },
      ports: [{ id: 'in',  dir: 'in',  type: 'pcie', accepts: ['NVMe'] },
              { id: 'out', dir: 'out', type: 'pcie' }] },

    { id: 'cpu',
      provides: ['cpu-execution'],
      ui: { label: 'CPU' },
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
