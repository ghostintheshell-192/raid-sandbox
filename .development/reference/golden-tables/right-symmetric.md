# Golden tables: right-symmetric

**Layout**: RAID 5, 4 disks, stripes 0..3. `ALGORITHM_RIGHT_SYMMETRIC` = 3 — the
kernel's own comment: *"Rotating Parity 0 with Data Continuation"*.
**Rule**: Linux v6.6, `drivers/md/raid5.c`, `raid5_compute_sector()`;
`drivers/md/raid5.h` for the constant.

## The rule

```c
/* drivers/md/raid5.h */
#define ALGORITHM_RIGHT_SYMMETRIC	3 /* Rotating Parity 0 with Data Continuation */

/* drivers/md/raid5.c, raid5_compute_sector() */
	int data_disks = raid_disks - conf->max_degraded;

	chunk_offset = sector_div(r_sector, sectors_per_chunk);
	chunk_number = r_sector;

	stripe = chunk_number;
	*dd_idx = sector_div(stripe, data_disks);
	stripe2 = stripe;

	case 5:
		switch (algorithm) {
		case ALGORITHM_RIGHT_SYMMETRIC:
			pd_idx = sector_div(stripe2, raid_disks);
			*dd_idx = (pd_idx + 1 + *dd_idx) % raid_disks;
			break;
```

In words. `sector_div(x, n)` divides `x` by `n` in place and returns the remainder.
With `raid_disks = 4` and `max_degraded = 1` for RAID 5, `data_disks = 3`. Chunk `c`
(one chunk per cell, so `chunk_number = c`) lands in stripe `c div 3`, with a
provisional data index `c mod 3` — its position counted over the data disks only.

- **Parity**: in stripe `s`, `pd_idx = s mod 4`. Parity starts on disk 0 ("Parity 0")
  and moves one disk to the *right* each stripe: 0, 1, 2, 3.
- **Data continuation**: the first chunk of the stripe goes on the disk just after the
  parity disk, and the rest follow to the right, wrapping around to disk 0 past the
  last disk: `dd_idx = (pd_idx + 1 + provisional) mod 4`.

## Derivation

Every stripe holds three chunks with provisional `dd_idx` = 0, 1, 2. For stripes 0..3,
`s mod 4 = s`.

**Stripe 0** — chunks 0, 1, 2. `pd_idx = 0`.
- D0: (0 + 1 + 0) mod 4 = 1
- D1: (0 + 1 + 1) mod 4 = 2
- D2: (0 + 1 + 2) mod 4 = 3
- Row: `P D0 D1 D2`

**Stripe 1** — chunks 3, 4, 5. `pd_idx = 1`.
- D3: (1 + 1 + 0) mod 4 = 2
- D4: (1 + 1 + 1) mod 4 = 3
- D5: (1 + 1 + 2) mod 4 = 4 mod 4 = 0
- Row: `D5 P D3 D4`

**Stripe 2** — chunks 6, 7, 8. `pd_idx = 2`.
- D6: (2 + 1 + 0) mod 4 = 3
- D7: (2 + 1 + 1) mod 4 = 4 mod 4 = 0
- D8: (2 + 1 + 2) mod 4 = 5 mod 4 = 1
- Row: `D7 D8 P D6`

**Stripe 3** — chunks 9, 10, 11. `pd_idx = 3`.
- D9: (3 + 1 + 0) mod 4 = 4 mod 4 = 0
- D10: (3 + 1 + 1) mod 4 = 5 mod 4 = 1
- D11: (3 + 1 + 2) mod 4 = 6 mod 4 = 2
- Row: `D9 D10 D11 P`

## Table

```golden
name: right-symmetric-raid5-4
disks: 4
0: P  D0  D1  D2
1: D5 P   D3  D4
2: D7 D8  P   D6
3: D9 D10 D11 P
```

## Conventions of the sandbox

None: the kernel rule decides every cell.
