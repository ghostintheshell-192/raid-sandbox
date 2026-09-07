# Golden tables: RAID 60

**Layout**: a stripe (RAID 0) over two spans, each a 6-disk RAID 6 drawn with
`ALGORITHM_ROTATING_N_CONTINUE` (= 10, Q immediately before P — the DDF convention the
sandbox uses for "left-symmetric" under RAID 6); 12 columns, stripes 0..2.
**Rule**: Linux v6.6, `drivers/md/raid5.c`, `raid5_compute_sector()` for the layout
*inside* each span; nothing across spans (see `raid50.md`, the same convention).

## The rule, inside a span

From `raid5_compute_sector()` with `conf->level == 6`, `raid_disks = 6`,
`data_disks = 6 − 2 = 4`:

```c
	stripe = chunk_number;
	*dd_idx = sector_div(stripe, data_disks);      /* stripe = chunk / 4, dd_idx = chunk % 4 */
	stripe2 = stripe;
	…
		case ALGORITHM_ROTATING_N_CONTINUE:
			/* Same as left_symmetric but Q is before P */
			pd_idx = raid_disks - 1 - sector_div(stripe2, raid_disks);  /* 5 − (stripe mod 6) */
			qd_idx = (pd_idx + raid_disks - 1) % raid_disks;             /* the disk before P */
			*dd_idx = (pd_idx + 1 + *dd_idx) % raid_disks;               /* data continues after P */
			ddf_layout = 1;
			break;
```

In words: P starts on the last disk and moves left one disk per stripe; Q is on the
disk just before P; the four data chunks follow P, wrapping.

## Derivation — one 6-disk span, local chunk numbers

| stripe *s* | chunks in *s* | pd_idx = 5 − (s mod 6) | qd_idx = (pd_idx + 5) mod 6 | chunk → (pd_idx + 1 + k) mod 6 | row |
|---|---|---|---|---|---|
| 0 | 0..3 | 5 | 4 | 0→0, 1→1, 2→2, 3→3 | `D0 D1 D2 D3 Q P` |
| 1 | 4..7 | 4 | 3 | 4→5, 5→0, 6→1, 7→2 | `D5 D6 D7 Q P D4` |
| 2 | 8..11 | 3 | 2 | 8→4, 9→5, 10→0, 11→1 | `D10 D11 Q P D8 D9` |

## The convention across spans

As in `raid50.md`: one span-stripe per span per round, span A then span B. With 2
spans and 4 data chunks per span-stripe, `global = r × 8 + j × 4 + k`: span A's local
0..3 / 4..7 / 8..11 are global 0..3 / 8..11 / 16..19; span B's are 4..7 / 12..15 /
20..23.

## Derivation — the array

| stripe | span A (local row → global) | span B (local row → global) |
|---|---|---|
| 0 | `D0 D1 D2 D3 Q P` → 0 1 2 3 | `D0 D1 D2 D3 Q P` → 4 5 6 7 |
| 1 | `D5 D6 D7 Q P D4` → 9 10 11 · · 8 | `D5 D6 D7 Q P D4` → 13 14 15 · · 12 |
| 2 | `D10 D11 Q P D8 D9` → 18 19 · · 16 17 | `D10 D11 Q P D8 D9` → 22 23 · · 20 21 |

## Table

```golden
name: raid60-2x6
disks: 12
0: D0  D1  D2  D3  Q   P   D4  D5  D6  D7  Q   P
1: D9  D10 D11 Q   P   D8  D13 D14 D15 Q   P   D12
2: D18 D19 Q   P   D16 D17 D22 D23 Q   P   D20 D21
```

## Conventions of the sandbox

- Q before P (`ALGORITHM_ROTATING_N_CONTINUE`) rather than mdadm's default for a RAID 6
  named left-symmetric (`ALGORITHM_LEFT_SYMMETRIC` in the level-6 switch, Q after P) —
  see `left-symmetric.md`.
- The cross-span numbering, as in `raid50.md`.
