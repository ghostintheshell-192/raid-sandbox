# Golden tables: right-asymmetric

**Layout**: RAID 5, 4 disks, stripes 0..3. `ALGORITHM_RIGHT_ASYMMETRIC` = 1 — the
kernel's own comment: *"Rotating Parity 0 with Data Restart"*.
**Rule**: Linux v6.6, `drivers/md/raid5.c`, `raid5_compute_sector()`;
`drivers/md/raid5.h` for the constant.

## The rule

```c
/* drivers/md/raid5.h */
#define ALGORITHM_RIGHT_ASYMMETRIC	1 /* Rotating Parity 0 with Data Restart */

/* drivers/md/raid5.c, raid5_compute_sector() */
	int data_disks = raid_disks - conf->max_degraded;

	chunk_offset = sector_div(r_sector, sectors_per_chunk);
	chunk_number = r_sector;

	stripe = chunk_number;
	*dd_idx = sector_div(stripe, data_disks);
	stripe2 = stripe;

	case 5:
		switch (algorithm) {
		case ALGORITHM_RIGHT_ASYMMETRIC:
			pd_idx = sector_div(stripe2, raid_disks);
			if (*dd_idx >= pd_idx)
				(*dd_idx)++;
			break;
```

In words. `sector_div(x, n)` divides `x` by `n` in place and returns the remainder.
With `raid_disks = 4` and `max_degraded = 1` for RAID 5, `data_disks = 3`. Chunk `c`
(one chunk per cell, so `chunk_number = c`) lands in stripe `c div 3`, with a
provisional data index `c mod 3` — its position counted over the data disks only.

- **Parity**: in stripe `s`, `pd_idx = s mod 4`. Parity starts on disk 0 ("Parity 0")
  and moves one disk to the *right* each stripe: 0, 1, 2, 3.
- **Data restart**: the provisional index is kept as-is if it is left of the parity
  disk, and shifted right by one if it would land on or after it. Data always
  restarts at disk 0 and simply skips over the parity slot.

## Derivation

Every stripe holds three chunks with provisional `dd_idx` = 0, 1, 2. For stripes 0..3,
`s mod 4 = s`.

**Stripe 0** — chunks 0, 1, 2. `pd_idx = 0`.
- D0: dd 0 ≥ 0? yes → 1
- D1: dd 1 ≥ 0? yes → 2
- D2: dd 2 ≥ 0? yes → 3
- Row: `P D0 D1 D2`

**Stripe 1** — chunks 3, 4, 5. `pd_idx = 1`.
- D3: dd 0 ≥ 1? no → 0
- D4: dd 1 ≥ 1? yes → 2
- D5: dd 2 ≥ 1? yes → 3
- Row: `D3 P D4 D5`

**Stripe 2** — chunks 6, 7, 8. `pd_idx = 2`.
- D6: dd 0 ≥ 2? no → 0
- D7: dd 1 ≥ 2? no → 1
- D8: dd 2 ≥ 2? yes → 3
- Row: `D6 D7 P D8`

**Stripe 3** — chunks 9, 10, 11. `pd_idx = 3`.
- D9: dd 0 ≥ 3? no → 0
- D10: dd 1 ≥ 3? no → 1
- D11: dd 2 ≥ 3? no → 2
- Row: `D9 D10 D11 P`

## Table

```golden
name: right-asymmetric-raid5-4
disks: 4
0: P  D0  D1  D2
1: D3 P   D4  D5
2: D6 D7  P   D8
3: D9 D10 D11 P
```

## Conventions of the sandbox

None: the kernel rule decides every cell.
