# Golden tables: RAID 50

**Layout**: a stripe (RAID 0) over two spans, each a 3-disk RAID 5 in left-symmetric
(`ALGORITHM_LEFT_SYMMETRIC` = 2); 6 columns, stripes 0..2.
**Rule**: Linux v6.6, `drivers/md/raid5.c`, `raid5_compute_sector()` for the layout
*inside* each span. The kernel defines nothing across spans: how the outer stripe
numbers its chunks over the two RAID 5 devices is a convention of the sandbox, stated
below.

## The rule, inside a span

From `raid5_compute_sector()` with `conf->level == 5`, `raid_disks = 3`,
`data_disks = raid_disks − max_degraded = 3 − 1 = 2`:

```c
	stripe = chunk_number;
	*dd_idx = sector_div(stripe, data_disks);      /* stripe = chunk / 2, dd_idx = chunk % 2 */
	stripe2 = stripe;
	…
		case ALGORITHM_LEFT_SYMMETRIC:
			pd_idx = data_disks - sector_div(stripe2, raid_disks);   /* 2 − (stripe mod 3) */
			*dd_idx = (pd_idx + 1 + *dd_idx) % raid_disks;           /* data continues after P, wrapping */
			break;
```

In words: in stripe *s* the parity sits on disk `2 − (s mod 3)`, starting rightmost and
moving one disk to the left each stripe; the two data chunks of the stripe sit on the
disks that follow the parity, wrapping round to disk 0.

## Derivation — one 3-disk span, local chunk numbers

| stripe *s* | chunks in *s* | *s* mod 3 | pd_idx | chunk → (pd_idx + 1 + k) mod 3 | row |
|---|---|---|---|---|---|
| 0 | 0, 1 | 0 | 2 | 0 → 0, 1 → 1 | `D0 D1 P` |
| 1 | 2, 3 | 1 | 1 | 2 → 2, 3 → 0 | `D3 P D2` |
| 2 | 4, 5 | 2 | 0 | 4 → 1, 5 → 2 | `P D4 D5` |

The same rows hold for both spans; only the chunk numbers change with the convention
below.

## The convention across spans

The outer stripe has two members, span A (columns 0–2) and span B (columns 3–5). The
sandbox numbers the array's chunks **one span-stripe per span per round**: round *r*
gives span A its stripe *r* (two chunks), then span B its stripe *r* (two chunks).
With 2 spans and 2 data chunks per span-stripe, the global chunk of span *j*, local
chunk *k*, round *r* is

```text
global = r × (2 spans × 2) + j × 2 + k
```

so span A's local chunks 0,1 / 2,3 / 4,5 are global 0,1 / 4,5 / 8,9 and span B's are
2,3 / 6,7 / 10,11. Within a span-stripe the write order is the span's own (the row
above); across spans it is A then B in every round.

This is a choice. An md RAID 0 whose chunk size equals one RAID 5 chunk would instead
hand *alternate chunks* to the two devices (chunk 0 to A, chunk 1 to B, …); a RAID 0
chunk as wide as a whole span-stripe gives the numbering used here. The sandbox draws
the second because it keeps every span-stripe's chunks consecutive, which is what the
animation shows as "one stripe written".

## Derivation — the array

| stripe | span A (local → global) | span B (local → global) | row |
|---|---|---|---|
| 0 | `D0 D1 P` → 0, 1 | `D0 D1 P` → 2, 3 | `D0 D1 P D2 D3 P` |
| 1 | `D3 P D2` → 5, 4 | `D3 P D2` → 7, 6 | `D5 P D4 D7 P D6` |
| 2 | `P D4 D5` → 8, 9 | `P D4 D5` → 10, 11 | `P D8 D9 P D10 D11` |

## Table

```golden
name: raid50-2x3
disks: 6
0: D0 D1 P  D2 D3 P
1: D5 P  D4 D7 P  D6
2: P  D8 D9 P  D10 D11
```

## Conventions of the sandbox

- The cross-span numbering above (one span-stripe per span per round, spans in
  ascending order). The kernel's RAID 0 defines the interleave by chunk size; the
  sandbox fixes it at one span-stripe.
- Everything inside a span is the kernel's rule.
