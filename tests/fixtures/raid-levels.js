/**
 * fixtures/raid-levels.js — the level catalogue MANIFEST, as the headless tests see it.
 *
 * The truth is `data/raid-levels/index.yaml` + the level files it lists. The
 * headless suites are zero-dependency and Node has no YAML parser, so they get
 * this JS mirror — and `raid-levels-data.test.js` (python3 + pyyaml) asserts the
 * mirror and the YAML agree on every field the engine reads: ids and their order,
 * `name`, `notRaid`, `reason`, `shape`, `minDisks`. Prose fields (description,
 * pros, cons, formulas) are not mirrored: nothing headless reads them.
 *
 * Edit the YAML first, then this file; a mismatch is a failing test.
 */

const leaf   = (segmentation, redundancy, extra = {}) => ({ segmentation, redundancy, members: 'disks', ...extra });
const nested = (segmentation, redundancy, childShape) => ({ segmentation, redundancy, members: 'arrays', childShape });

module.exports = {
  levels: [
    { id: 'jbod',   name: 'JBOD / spanned', notRaid: true,
      reason: 'concatenation of disks (no RAID)',
      shape: leaf('linear', 'none'), minDisks: 2 },

    { id: 'raid0',  name: 'RAID 0', notRaid: false,
      reason: 'striping, no redundancy',
      shape: leaf('striped', 'none'), minDisks: 2 },

    { id: 'raid1',  name: 'RAID 1', notRaid: false,
      reason: 'mirroring, {n} copies',
      shape: leaf('linear', 'mirror'), minDisks: 2 },

    { id: 'raid5',  name: 'RAID 5', notRaid: false,
      reason: 'striping with single distributed parity',
      shape: leaf('striped', 'parity1'), minDisks: 3 },

    { id: 'raid6',  name: 'RAID 6', notRaid: false,
      reason: 'striping with double distributed parity',
      shape: leaf('striped', 'parity2'), minDisks: 4 },

    { id: 'raid10', name: 'RAID 10', notRaid: false,
      reason: 'striped mirroring, 2 copies (flat RAID 10)',
      shape: leaf('striped', 'mirror', { constraint: 'even-disk-count', copies: 2 }), minDisks: 4 },

    { id: 'raid1e', name: 'RAID 1E', notRaid: false,
      reason: 'interleaved striped mirroring, odd disk count',
      shape: leaf('striped', 'mirror', { constraint: 'odd-disk-count', copies: 2 }), minDisks: 3 },

    { id: 'raid1plus0', name: 'RAID 1+0', notRaid: false,
      reason: 'striping over mirror spans (nested 1+0)',
      shape: nested('striped', 'none', leaf('linear', 'mirror')), minDisks: 4 },

    { id: 'raid100', name: 'RAID 100', notRaid: false,
      reason: 'striping over RAID 10 spans (1+0+0)',
      shape: nested('striped', 'none', leaf('striped', 'mirror', { constraint: 'even-disk-count' })), minDisks: 8 },

    { id: 'raid50', name: 'RAID 50', notRaid: false,
      reason: 'striping over RAID-5 spans (5+0)',
      shape: nested('striped', 'none', leaf('striped', 'parity1')), minDisks: 6 },

    { id: 'raid60', name: 'RAID 60', notRaid: false,
      reason: 'striping over RAID-6 spans (6+0)',
      shape: nested('striped', 'none', leaf('striped', 'parity2')), minDisks: 8 },

    { id: 'raid51', name: 'RAID 51', notRaid: false,
      reason: 'mirror over RAID-5 spans (5+1)',
      shape: nested('linear', 'mirror', leaf('striped', 'parity1')), minDisks: 6 },

    { id: 'raid61', name: 'RAID 61', notRaid: false,
      reason: 'mirror over RAID-6 spans (6+1)',
      shape: nested('linear', 'mirror', leaf('striped', 'parity2')), minDisks: 8 },

    { id: 'raid0plus1', name: 'RAID 0+1', notRaid: false,
      reason: 'mirror over RAID-0 spans (0+1)',
      shape: nested('linear', 'mirror', leaf('striped', 'none')), minDisks: 4 },
  ],
};
