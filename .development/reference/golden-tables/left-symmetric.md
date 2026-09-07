# Golden tables: left-symmetric

**Layout**:

- `left-symmetric-raid5-4` — RAID 5, 4 disks, stripes 0..3, `ALGORITHM_LEFT_SYMMETRIC` (= 2).
- `left-symmetric-raid6-5` — RAID 6, 5 disks, stripes 0..4, `ALGORITHM_ROTATING_N_CONTINUE` (= 10).

**Rule**: Linux v6.6, `drivers/md/raid5.c`, `raid5_compute_sector()`; `drivers/md/raid5.h`
for the `ALGORITHM_*` constants.

## The rule

The constants (`drivers/md/raid5.h`):

```c
#define ALGORITHM_LEFT_SYMMETRIC	2 /* Rotating Parity N with Data Continuation */
/* ... */
#define ALGORITHM_ROTATING_N_CONTINUE	10 /*DDF PRL=6 RLQ=3 */
```

The prologue of `raid5_compute_sector()`, which turns a chunk number into a stripe
number and a provisional data index, and the two `case` bodies that apply here
(`drivers/md/raid5.c`):

```c
	int data_disks = raid_disks - conf->max_degraded;

	/*
	 * Compute the chunk number and the sector offset inside the chunk
	 */
	chunk_offset = sector_div(r_sector, sectors_per_chunk);
	chunk_number = r_sector;

	/*
	 * Compute the stripe number
	 */
	stripe = chunk_number;
	*dd_idx = sector_div(stripe, data_disks);
	stripe2 = stripe;
	/*
	 * Select the parity disk based on the user selected algorithm.
	 */
	pd_idx = qd_idx = -1;
	switch(conf->level) {
	case 5:
		switch (algorithm) {
		/* ... */
		case ALGORITHM_LEFT_SYMMETRIC:
			pd_idx = data_disks - sector_div(stripe2, raid_disks);
			*dd_idx = (pd_idx + 1 + *dd_idx) % raid_disks;
			break;
		/* ... */
		}
		break;
	case 6:
		switch (algorithm) {
		/* ... */
		case ALGORITHM_ROTATING_N_CONTINUE:
			/* Same as left_symmetric but Q is before P */
			pd_idx = raid_disks - 1 - sector_div(stripe2, raid_disks);
			qd_idx = (pd_idx + raid_disks - 1) % raid_disks;
			*dd_idx = (pd_idx + 1 + *dd_idx) % raid_disks;
			ddf_layout = 1;
			break;
		/* ... */
		}
		break;
	}
```

In words. `sector_div(x, n)` divides `x` by `n` in place (integer division) and returns
the remainder. So, with chunks numbered 0, 1, 2, … in logical (write) order and
`data_disks = raid_disks − max_degraded` (max_degraded is 1 for RAID 5, 2 for RAID 6):

- chunk *c* lives in stripe `s = c div data_disks`, and starts with a provisional data
  index `d0 = c mod data_disks` — its position among the data chunks of its stripe;
- `sector_div(stripe2, raid_disks)` evaluates to `s mod raid_disks`: the rotation
  step of the stripe.

**RAID 5, `ALGORITHM_LEFT_SYMMETRIC`.** The parity disk of stripe *s* is
`pd_idx = data_disks − (s mod raid_disks)`. Since `data_disks = raid_disks − 1`, this
is the last disk for stripe 0 and walks one disk to the left per stripe ("Rotating
Parity N"). The data chunk with provisional index `d0` goes to disk
`(pd_idx + 1 + d0) mod raid_disks`: the data starts on the disk right after parity
and continues around the ring, wrapping at the last disk ("Data Continuation").

**RAID 6, `ALGORITHM_ROTATING_N_CONTINUE`.** The parity disk is
`pd_idx = raid_disks − 1 − (s mod raid_disks)` — the same value as above, since
`raid_disks − 1` and `data_disks` differ (for RAID 6 `data_disks = raid_disks − 2`) but
the expression here is written against `raid_disks − 1` explicitly. The Q disk is
`qd_idx = (pd_idx + raid_disks − 1) mod raid_disks`, i.e. the disk immediately *before*
P, wrapping to the last disk when P is on disk 0. The data chunk with provisional
index `d0` goes to disk `(pd_idx + 1 + d0) mod raid_disks`: it starts right after P and
continues around the ring; since Q sits just before P, the data walks from P+1 up to
Q−1 without ever landing on Q.

## Derivation — RAID 5, 4 disks

`raid_disks = 4`, `max_degraded = 1`, `data_disks = 4 − 1 = 3`. Each stripe holds 3
chunks; chunk *c* has `s = c div 3`, `d0 = c mod 3`.

- `pd_idx = 3 − (s mod 4)`
- `dd_idx = (pd_idx + 1 + d0) mod 4`

**Stripe 0** — chunks 0, 1, 2 (d0 = 0, 1, 2). `s mod 4 = 0`, `pd_idx = 3 − 0 = 3`.

| chunk | d0 | (pd_idx + 1 + d0) mod 4 | disk |
|-------|----|-------------------------|------|
| 0 | 0 | (3 + 1 + 0) mod 4 = 4 mod 4 | 0 |
| 1 | 1 | (3 + 1 + 1) mod 4 = 5 mod 4 | 1 |
| 2 | 2 | (3 + 1 + 2) mod 4 = 6 mod 4 | 2 |

Row 0: disk 0 = D0, disk 1 = D1, disk 2 = D2, disk 3 = P → `D0 D1 D2 P`

**Stripe 1** — chunks 3, 4, 5 (d0 = 0, 1, 2). `s mod 4 = 1`, `pd_idx = 3 − 1 = 2`.

| chunk | d0 | (pd_idx + 1 + d0) mod 4 | disk |
|-------|----|-------------------------|------|
| 3 | 0 | (2 + 1 + 0) mod 4 = 3 mod 4 | 3 |
| 4 | 1 | (2 + 1 + 1) mod 4 = 4 mod 4 | 0 |
| 5 | 2 | (2 + 1 + 2) mod 4 = 5 mod 4 | 1 |

Row 1: disk 0 = D4, disk 1 = D5, disk 2 = P, disk 3 = D3 → `D4 D5 P D3`

**Stripe 2** — chunks 6, 7, 8 (d0 = 0, 1, 2). `s mod 4 = 2`, `pd_idx = 3 − 2 = 1`.

| chunk | d0 | (pd_idx + 1 + d0) mod 4 | disk |
|-------|----|-------------------------|------|
| 6 | 0 | (1 + 1 + 0) mod 4 = 2 mod 4 | 2 |
| 7 | 1 | (1 + 1 + 1) mod 4 = 3 mod 4 | 3 |
| 8 | 2 | (1 + 1 + 2) mod 4 = 4 mod 4 | 0 |

Row 2: disk 0 = D8, disk 1 = P, disk 2 = D6, disk 3 = D7 → `D8 P D6 D7`

**Stripe 3** — chunks 9, 10, 11 (d0 = 0, 1, 2). `s mod 4 = 3`, `pd_idx = 3 − 3 = 0`.

| chunk | d0 | (pd_idx + 1 + d0) mod 4 | disk |
|-------|----|-------------------------|------|
| 9  | 0 | (0 + 1 + 0) mod 4 = 1 mod 4 | 1 |
| 10 | 1 | (0 + 1 + 1) mod 4 = 2 mod 4 | 2 |
| 11 | 2 | (0 + 1 + 2) mod 4 = 3 mod 4 | 3 |

Row 3: disk 0 = P, disk 1 = D9, disk 2 = D10, disk 3 = D11 → `P D9 D10 D11`

Stripe 4 would have `s mod 4 = 0` again and repeat the shape of stripe 0 with chunks
12..14: the period of the rotation is `raid_disks = 4` stripes, so stripes 0..3 show the
whole pattern.

## Derivation — RAID 6, 5 disks

`raid_disks = 5`, `max_degraded = 2`, `data_disks = 5 − 2 = 3`. Each stripe holds 3
chunks; chunk *c* has `s = c div 3`, `d0 = c mod 3`.

- `pd_idx = 5 − 1 − (s mod 5) = 4 − (s mod 5)`
- `qd_idx = (pd_idx + 5 − 1) mod 5 = (pd_idx + 4) mod 5`
- `dd_idx = (pd_idx + 1 + d0) mod 5`

**Stripe 0** — chunks 0, 1, 2 (d0 = 0, 1, 2). `s mod 5 = 0`, `pd_idx = 4 − 0 = 4`,
`qd_idx = (4 + 4) mod 5 = 8 mod 5 = 3`.

| chunk | d0 | (pd_idx + 1 + d0) mod 5 | disk |
|-------|----|-------------------------|------|
| 0 | 0 | (4 + 1 + 0) mod 5 = 5 mod 5 | 0 |
| 1 | 1 | (4 + 1 + 1) mod 5 = 6 mod 5 | 1 |
| 2 | 2 | (4 + 1 + 2) mod 5 = 7 mod 5 | 2 |

Row 0: disk 0 = D0, disk 1 = D1, disk 2 = D2, disk 3 = Q, disk 4 = P → `D0 D1 D2 Q P`

**Stripe 1** — chunks 3, 4, 5 (d0 = 0, 1, 2). `s mod 5 = 1`, `pd_idx = 4 − 1 = 3`,
`qd_idx = (3 + 4) mod 5 = 7 mod 5 = 2`.

| chunk | d0 | (pd_idx + 1 + d0) mod 5 | disk |
|-------|----|-------------------------|------|
| 3 | 0 | (3 + 1 + 0) mod 5 = 4 mod 5 | 4 |
| 4 | 1 | (3 + 1 + 1) mod 5 = 5 mod 5 | 0 |
| 5 | 2 | (3 + 1 + 2) mod 5 = 6 mod 5 | 1 |

Row 1: disk 0 = D4, disk 1 = D5, disk 2 = Q, disk 3 = P, disk 4 = D3 → `D4 D5 Q P D3`

**Stripe 2** — chunks 6, 7, 8 (d0 = 0, 1, 2). `s mod 5 = 2`, `pd_idx = 4 − 2 = 2`,
`qd_idx = (2 + 4) mod 5 = 6 mod 5 = 1`.

| chunk | d0 | (pd_idx + 1 + d0) mod 5 | disk |
|-------|----|-------------------------|------|
| 6 | 0 | (2 + 1 + 0) mod 5 = 3 mod 5 | 3 |
| 7 | 1 | (2 + 1 + 1) mod 5 = 4 mod 5 | 4 |
| 8 | 2 | (2 + 1 + 2) mod 5 = 5 mod 5 | 0 |

Row 2: disk 0 = D8, disk 1 = Q, disk 2 = P, disk 3 = D6, disk 4 = D7 → `D8 Q P D6 D7`

**Stripe 3** — chunks 9, 10, 11 (d0 = 0, 1, 2). `s mod 5 = 3`, `pd_idx = 4 − 3 = 1`,
`qd_idx = (1 + 4) mod 5 = 5 mod 5 = 0`.

| chunk | d0 | (pd_idx + 1 + d0) mod 5 | disk |
|-------|----|-------------------------|------|
| 9  | 0 | (1 + 1 + 0) mod 5 = 2 mod 5 | 2 |
| 10 | 1 | (1 + 1 + 1) mod 5 = 3 mod 5 | 3 |
| 11 | 2 | (1 + 1 + 2) mod 5 = 4 mod 5 | 4 |

Row 3: disk 0 = Q, disk 1 = P, disk 2 = D9, disk 3 = D10, disk 4 = D11 → `Q P D9 D10 D11`

**Stripe 4** — chunks 12, 13, 14 (d0 = 0, 1, 2). `s mod 5 = 4`, `pd_idx = 4 − 4 = 0`,
`qd_idx = (0 + 4) mod 5 = 4 mod 5 = 4` (Q wraps to the last disk).

| chunk | d0 | (pd_idx + 1 + d0) mod 5 | disk |
|-------|----|-------------------------|------|
| 12 | 0 | (0 + 1 + 0) mod 5 = 1 mod 5 | 1 |
| 13 | 1 | (0 + 1 + 1) mod 5 = 2 mod 5 | 2 |
| 14 | 2 | (0 + 1 + 2) mod 5 = 3 mod 5 | 3 |

Row 4: disk 0 = P, disk 1 = D12, disk 2 = D13, disk 3 = D14, disk 4 = Q → `P D12 D13 D14 Q`

Stripe 5 would have `s mod 5 = 0` again: the period is `raid_disks = 5` stripes, so
stripes 0..4 show the whole pattern.

## Tables

```golden
name: left-symmetric-raid5-4
disks: 4
0: D0 D1 D2 P
1: D4 D5 P  D3
2: D8 P  D6 D7
3: P  D9 D10 D11
```

```golden
name: left-symmetric-raid6-5
disks: 5
0: D0 D1 D2 Q  P
1: D4 D5 Q  P  D3
2: D8 Q  P  D6 D7
3: Q  P  D9 D10 D11
4: P  D12 D13 D14 Q
```

## Conventions of the sandbox

**Which RAID 6 algorithm "left-symmetric" means.** The kernel's level-6 switch has two
rotating-parity layouts that both put the data after P and continue it around the
ring; they differ only in which side of P the Q block sits on. The default mdadm
assigns to a RAID 6 created as `left-symmetric` is `ALGORITHM_LEFT_SYMMETRIC` (= 2),
which places Q immediately **after** P:

```c
		case ALGORITHM_LEFT_SYMMETRIC:
			pd_idx = raid_disks - 1 - sector_div(stripe2, raid_disks);
			qd_idx = (pd_idx + 1) % raid_disks;
			*dd_idx = (pd_idx + 2 + *dd_idx) % raid_disks;
			break;
```

Under that layout stripe 0 of a 5-disk array reads `D0 D1 D2 P Q` and stripe 1 reads
`D4 D5 P Q D3`. The sandbox instead draws `ALGORITHM_ROTATING_N_CONTINUE` (= 10), the
DDF convention (PRL=6, RLQ=3), which places Q immediately **before** P:

```c
		case ALGORITHM_ROTATING_N_CONTINUE:
			/* Same as left_symmetric but Q is before P */
			pd_idx = raid_disks - 1 - sector_div(stripe2, raid_disks);
			qd_idx = (pd_idx + raid_disks - 1) % raid_disks;
			*dd_idx = (pd_idx + 1 + *dd_idx) % raid_disks;
			ddf_layout = 1;
			break;
```

That is the layout the `left-symmetric-raid6-5` table above derives. The choice of
`ROTATING_N_CONTINUE` over `LEFT_SYMMETRIC` for the RAID 6 picture labelled
"left-symmetric" is the sandbox's, not the kernel's: both are real kernel layouts, and
the kernel does not decide which one a picture with that label should show. P and the
data chunks land on the same disks under either; only Q moves.
