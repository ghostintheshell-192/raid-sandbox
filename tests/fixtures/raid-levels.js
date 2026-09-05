/**
 * fixtures/raid-levels.js — the level catalogue MANIFEST, as the headless tests see it.
 *
 * The truth is `data/raid-levels/index.yaml` + the level files it lists. The
 * headless suites are zero-dependency and Node has no YAML parser, so they get
 * this JS mirror — and `raid-levels-data.test.js` (python3 + pyyaml) asserts the
 * mirror and the YAML agree on every field the engine reads: ids and their order,
 * `name`, `notRaid`, `reason`, `shape`, `minDisks`, `advisory`, and the collapse
 * keys of the leaf levels — `minDisksToRun`, `minDisksToRunSource`, `collapsesTo`,
 * `absorbsNested`.
 * Prose fields (description, pros, cons, formulas) are not mirrored: nothing
 * headless reads them.
 *
 * Edit the YAML first, then this file; a mismatch is a failing test.
 */

const leaf   = (segmentation, redundancy, extra = {}) => ({ segmentation, redundancy, members: 'disks', ...extra });
const nested = (segmentation, redundancy, childShape) => ({ segmentation, redundancy, members: 'arrays', childShape });

// The three levels whose minimum is the structural one share the sentence.
const STRUCTURAL = 'structural — an array of one member is that member; the sandbox refuses it before any level is named (spec §6, the universal ≥ 2)';
const MIRROR     = { segmentation: 'linear', redundancy: 'mirror' };

module.exports = {
  levels: [
    { id: 'jbod',   name: 'JBOD / spanned', notRaid: true,
      reason: 'concatenation of disks (no RAID)',
      shape: leaf('linear', 'none'), minDisks: 2,
      minDisksToRun: 2, minDisksToRunSource: STRUCTURAL },

    { id: 'raid0',  name: 'RAID 0', notRaid: false,
      reason: 'striping, no redundancy',
      shape: leaf('striped', 'none'), minDisks: 2,
      minDisksToRun: 2, minDisksToRunSource: STRUCTURAL },

    { id: 'raid1',  name: 'RAID 1', notRaid: false,
      reason: 'mirroring, {n} copies',
      shape: leaf('linear', 'mirror'), minDisks: 2,
      minDisksToRun: 2, minDisksToRunSource: STRUCTURAL,
      absorbsNested: {
        because: 'a mirror of mirrors is one mirror — every disk still holds a full copy',
        source:  'content algebra (degenerate-levels §6): every cell of every member carries the same segment, so the copy count is the disk count' } },

    { id: 'raid5',  name: 'RAID 5', notRaid: false,
      reason: 'striping with single distributed parity',
      shape: leaf('striped', 'parity1'), minDisks: 3,
      minDisksToRun: 2,
      minDisksToRunSource: 'drivers/md/raid5.c raid5_takeover_raid1(): a 2-device RAID 1 is converted to RAID 5 in place (any other count is refused); mdadm creates 2-device RAID 5',
      collapsesTo: [
        { disks: 2, becomes: MIRROR,
          because: 'with one data block per stripe the parity is that block itself — the second disk holds a copy',
          source:  'drivers/md/raid5.c raid5_takeover_raid1(): the kernel turns a 2-disk RAID 1 into a 2-disk RAID 5 in place, ALGORITHM_LEFT_SYMMETRIC, no data moved' },
      ] },

    { id: 'raid6',  name: 'RAID 6', notRaid: false,
      reason: 'striping with double distributed parity',
      shape: leaf('striped', 'parity2'), minDisks: 4,
      minDisksToRun: 4,
      minDisksToRunSource: "drivers/md/raid5.c setup_conf(): 'not enough configured devices (%d, minimum 4)'",
      collapsesTo: [
        { disks: 3, becomes: MIRROR,
          because: 'with one data block per stripe both P and Q are that block itself — every disk holds a copy',
          source:  'algebra: P = D0, Q = g⁰·D0 = D0 — three copies; drivers/md/raid5.c setup_conf() refuses to start it' },
      ] },

    { id: 'raid10', name: 'RAID 10', notRaid: false,
      reason: 'striped mirroring, 2 copies (flat RAID 10)',
      shape: leaf('striped', 'mirror', { constraint: 'even-disk-count', copies: 2 }), minDisks: 4,
      minDisksToRun: 2,
      minDisksToRunSource: 'drivers/md/raid10.c setup_conf(): the only bound on the device count is copies ≤ raid_disks, so a 2-device near-2 array starts',
      collapsesTo: [
        { disks: 2, becomes: MIRROR,
          because: 'two copies over two disks: every chunk sits on both, there is nothing left to stripe across',
          source:  'drivers/md/raid10.c setup_conf(): copies == raid_disks is accepted; with 2 copies on 2 devices each device holds every chunk, near or far' },
      ] },

    { id: 'raid1e', name: 'RAID 1E', notRaid: false,
      reason: 'interleaved striped mirroring, odd disk count',
      shape: leaf('striped', 'mirror', { constraint: 'odd-disk-count', copies: 2 }), minDisks: 3,
      minDisksToRun: 3,
      minDisksToRunSource: "drivers/md/raid10.c setup_conf(): no bound on the device count beyond copies ≤ raid_disks — 3 devices start; 2 is an even count, RAID 10's shape" },

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
      shape: nested('linear', 'mirror', leaf('striped', 'none')), minDisks: 4,
      advisory: '{label} is a RAID 0+1: a mirror of stripes. It guarantees one failure, like RAID 1+0, '
        + 'but a failed disk takes its whole striped leg with it, so a second failure is fatal in 2 cases '
        + 'out of 3 — RAID 1+0 survives it in 2 cases out of 3. Same disks, same capacity, weaker array: '
        + 'nest the other way round.' },
  ],
};
