# Golden tables: left-asymmetric

**Layout**: RAID 5, 4 disks, stripes 0..3. `ALGORITHM_LEFT_ASYMMETRIC` = 0 — the
kernel's own comment: *"Rotating Parity N with Data Restart"*.
**Rule**: Linux v6.6, `drivers/md/raid5.c`, `raid5_compute_sector()`;
`drivers/md/raid5.h` for the constant.

## The rule

```c
/* drivers/md/raid5.h */
#define ALGORITHM_LEFT_ASYMMETRIC	0 /* Rotating Parity N with Data Restart */

/* drivers/md/raid5.c, raid5_compute_sector() */
	int data_disks = raid_disks - conf->max_degraded;

	chunk_offset = sector_div(r_sector, sectors_per_chunk);
	chunk_number = r_sector;

	stripe = chunk_number;
	*dd_idx = sector_div(stripe, data_disks);
	stripe2 = stripe;

	case 5:
		switch (algorithm) {
		case ALGORITHM_LEFT_ASYMMETRIC:
			pd_idx = data_disks - sector_div(stripe2, raid_disks);
			if (*dd_idx >= pd_idx)
				(*dd_idx)++;
			break;
```

In words. `sector_div(x, n)` divides `x` by `n` in place and returns the remainder.
With `raid_disks = 4` and `max_degraded = 1` for RAID 5, `data_disks = 3`. Chunk `c`
(one chunk per cell, so `chunk_number = c`) lands in stripe `c div 3`, with a
provisional data index `c mod 3` — its position counted over the data disks only.

- **Parity**: in stripe `s`, `pd_idx = 3 − (s mod 4)`. Parity starts on the last disk
  (disk 3, "Parity N") and moves one disk to the *left* each stripe: 3, 2, 1, 0.
- **Data restart**: the provisional index is kept as-is if it is left of the parity
  disk, and shifted right by one if it would land on or after it. Data always
  restarts at disk 0 and simply skips over the parity slot.

## Derivation

Every stripe holds three chunks with provisional `dd_idx` = 0, 1, 2. For stripes 0..3,
`s mod 4 = s`.

**Stripe 0** — chunks 0, 1, 2. `pd_idx = 3 − 0 = 3`.
- D0: dd 0 ≥ 3? no → 0
- D1: dd 1 ≥ 3? no → 1
- D2: dd 2 ≥ 3? no → 2
- Row: `D0 D1 D2 P`

**Stripe 1** — chunks 3, 4, 5. `pd_idx = 3 − 1 = 2`.
- D3: dd 0 ≥ 2? no → 0
- D4: dd 1 ≥ 2? no → 1
- D5: dd 2 ≥ 2? yes → 3
- Row: `D3 D4 P D5`

**Stripe 2** — chunks 6, 7, 8. `pd_idx = 3 − 2 = 1`.
- D6: dd 0 ≥ 1? no → 0
- D7: dd 1 ≥ 1? yes → 2
- D8: dd 2 ≥ 1? yes → 3
- Row: `D6 P D7 D8`

**Stripe 3** — chunks 9, 10, 11. `pd_idx = 3 − 3 = 0`.
- D9: dd 0 ≥ 0? yes → 1
- D10: dd 1 ≥ 0? yes → 2
- D11: dd 2 ≥ 0? yes → 3
- Row: `P D9 D10 D11`

## Table

```golden
name: left-asymmetric-raid5-4
disks: 4
0: D0 D1 D2 P
1: D3 D4 P  D5
2: D6 P  D7 D8
3: P  D9 D10 D11
```

## Conventions of the sandbox

None: the kernel rule decides every cell.
