# Golden tables: RAID 100

**Layout**: a stripe (RAID 0) over two spans, each a 4-disk RAID 10 in the md *near*
layout (near_copies = 2, far_copies = 1); 8 columns, stripes 0..1.
**Rule**: Linux v6.6, `drivers/md/raid10.c`, `__raid10_find_phys()` for the layout
*inside* each span (derived in `raid10-near.md`); nothing across spans (see
`raid50.md`, the same convention).

## The rule, inside a span

From `__raid10_find_phys()` with `raid_disks = 4`, `near_copies = 2`, `far_copies = 1`:

```c
	chunk *= geo->near_copies;                 /* slot stream: chunk × 2 */
	stripe = chunk;
	dev = sector_div(stripe, geo->raid_disks); /* stripe = slot / 4, dev = slot mod 4 */
	…
	for (n = 0; n < geo->near_copies; n++) {   /* the two copies on consecutive devices */
		…
		dev++;
		if (dev >= geo->raid_disks) { dev = 0; sector += (geo->chunk_mask + 1); }
	}
```

In words: chunk *c* occupies slots 2*c* and 2*c*+1 of a stream laid across the disks
row by row; the two slots are its two copies, on adjacent disks.

## Derivation — one 4-disk span, local chunk numbers

| chunk *c* | slots 2c, 2c+1 | stripe = slot / 4 | devices = slot mod 4 | cells |
|---|---|---|---|---|
| 0 | 0, 1 | 0 | 0, 1 | `D0 M0` on disks 0, 1 |
| 1 | 2, 3 | 0 | 2, 3 | `D1 M1` on disks 2, 3 |
| 2 | 4, 5 | 1 | 0, 1 | `D2 M2` on disks 0, 1 |
| 3 | 6, 7 | 1 | 2, 3 | `D3 M3` on disks 2, 3 |

Rows: `D0 M0 D1 M1`, `D2 M2 D3 M3`.

## The convention across spans

As in `raid50.md`: one span-stripe per span per round, span A then span B. Two
chunks per span-stripe, so `global = r × 4 + j × 2 + k`: span A's local 0,1 / 2,3 are
global 0,1 / 4,5; span B's are 2,3 / 6,7.

## Table

```golden
name: raid100-2x4
disks: 8
0: D0 M0 D1 M1 D2 M2 D3 M3
1: D4 M4 D5 M5 D6 M6 D7 M7
```

## Conventions of the sandbox

- The first slot of each chunk is drawn as `D`, the second as `M`; the kernel's two
  copies are equals (see `raid10-near.md`).
- The cross-span numbering, as in `raid50.md`.
