# Golden tables: RAID 10 far

**Layout** (`raid10-far-4`): 4 disks, near_copies = 1, far_copies = 2, far_offset = 0,
layout word `0x201` ("f2"), chunks 0..7, 2 stripes in the near region + 2 stripes in the
far region, drawn as 4 rows.
**Rule**: Linux v6.6, `drivers/md/raid10.c`, `__raid10_find_phys()`; `setup_geo()` for the
layout word; the header comment for the description.

## The rule

```c
/* drivers/md/raid10.c, header comment */
 * The data to be stored is divided into chunks using chunksize.  Each device
 * is divided into far_copies sections.   In each section, chunks are laid out
 * in a style similar to raid0, but near_copies copies of each chunk is stored
 * (each on a different drive).  The starting device for each section is offset
 * near_copies from the starting device of the previous section.  Thus there
 * are (near_copies * far_copies) of each chunk, and each is on a different
 * drive.  near_copies and far_copies must be at least one, and their product
 * is at most raid_disks.
 ...
 * Example 'far' algorithm w/o 'use_far_sets' (each letter represents a chunk
 * on a device):
 *    A B C D    A B C D E
 *      ...         ...
 *    D A B C    E A B C D

/* drivers/md/raid10.h, struct geom */
		sector_t	stride;	      /* distance between far copies.
					       * This is size / far_copies unless
					       * far_offset, in which case it is
					       * 1 stripe.
					       */
		int             far_set_size; /* The number of devices in a set,
					       * where a 'set' are devices that
					       * contain far/offset copies of
					       * each other.
					       */

/* drivers/md/raid10.c, setup_geo() */
	nc = layout & 255;
	fc = (layout >> 8) & 255;
	fo = layout & (1<<16);
	...
	switch (layout >> 17) {
	case 0:	/* original layout.  simple but not always optimal */
		geo->far_set_size = disks;
		break;

/* drivers/md/raid10.c, __raid10_find_phys() */
	last_far_set_start = (geo->raid_disks / geo->far_set_size) - 1;
	last_far_set_start *= geo->far_set_size;

	last_far_set_size = geo->far_set_size;
	last_far_set_size += (geo->raid_disks % geo->far_set_size);

	/* now calculate first sector/dev */
	chunk = r10bio->sector >> geo->chunk_shift;
	sector = r10bio->sector & geo->chunk_mask;

	chunk *= geo->near_copies;
	stripe = chunk;
	dev = sector_div(stripe, geo->raid_disks);
	if (geo->far_offset)
		stripe *= geo->far_copies;

	sector += stripe << geo->chunk_shift;

	/* and calculate all the others */
	for (n = 0; n < geo->near_copies; n++) {
		int d = dev;
		int set;
		sector_t s = sector;
		r10bio->devs[slot].devnum = d;
		r10bio->devs[slot].addr = s;
		slot++;

		for (f = 1; f < geo->far_copies; f++) {
			set = d / geo->far_set_size;
			d += geo->near_copies;

			if ((geo->raid_disks % geo->far_set_size) &&
			    (d > last_far_set_start)) {
				d -= last_far_set_start;
				d %= last_far_set_size;
				d += last_far_set_start;
			} else {
				d %= geo->far_set_size;
				d += geo->far_set_size * set;
			}
			s += geo->stride;
			r10bio->devs[slot].devnum = d;
			r10bio->devs[slot].addr = s;
			slot++;
		}
		dev++;
		if (dev >= geo->raid_disks) {
			dev = 0;
			sector += (geo->chunk_mask + 1);
		}
	}
```

In words. The layout word `0x201` gives `nc = 0x201 & 255 = 1`, `fc = (0x201 >> 8) & 255 =
2`, `fo = 0x201 & 0x10000 = 0`, and `0x201 >> 17 = 0` selects the original layout, so
`far_set_size = raid_disks = 4`. Then `last_far_set_start = (4 / 4 − 1) × 4 = 0`,
`last_far_set_size = 4 + (4 mod 4) = 4`, and `raid_disks mod far_set_size = 0`, so the
`if` in the inner loop is always false and the `else` branch applies: `d %= 4;
d += 4 × set` with `set = d / 4 = 0` for every device — the far copy's device is simply
`(d + near_copies) mod 4`.

Each device is cut into `far_copies = 2` sections of equal size, and `stride = size / 2`
is the distance from a chunk in the first section to its copy in the second. With
`near_copies = 1` the outer loop runs once, so there is a single first copy per chunk:
`chunk = c`, `stripe = c ÷ 4`, `dev = c mod 4` — pure RAID 0 in the first section. With
`far_offset = 0` the `stripe *= far_copies` line is skipped, so the first section is
packed: stripe `s` of the array is stripe `s` of the device. The inner loop then places
one further copy `stride` sectors later (the same stripe index, but in the second
section) and `near_copies = 1` device to the right, wrapping mod 4. This is exactly the
header comment's `A B C D` over `D A B C`.

## Derivation

Notation: `(disk, row)`. Working in whole chunks. Let `S` be the number of chunks per
section on one device (`S = stride / chunk size`; on a real device this is half the
device). The first copy of chunk `c` sits at device stripe `c ÷ 4`; its far copy at device
stripe `c ÷ 4 + S`.

| c | chunk = c | stripe = c ÷ 4 | dev = c mod 4 | n = 0, f = 0 (`D`) | d = (dev + 1) mod 4 | s = stripe + S | f = 1 (`M`) |
|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | (0, 0) | 1 | 0 + S | (1, S) |
| 1 | 1 | 0 | 1 | (1, 0) | 2 | 0 + S | (2, S) |
| 2 | 2 | 0 | 2 | (2, 0) | 3 | 0 + S | (3, S) |
| 3 | 3 | 0 | 3 | (3, 0) | 4 mod 4 = 0 | 0 + S | (0, S) |
| 4 | 4 | 1 | 0 | (0, 1) | 1 | 1 + S | (1, S+1) |
| 5 | 5 | 1 | 1 | (1, 1) | 2 | 1 + S | (2, S+1) |
| 6 | 6 | 1 | 2 | (2, 1) | 3 | 1 + S | (3, S+1) |
| 7 | 7 | 1 | 3 | (3, 1) | 4 mod 4 = 0 | 1 + S | (0, S+1) |

So the device stripes in use are 0, 1 (the near region, chunks 0–7 in RAID 0 order) and
S, S+1 (the far region, the same two stripes each rotated one device to the right).
Every chunk is on two different devices, and the far copy of a whole stripe is the stripe
shifted right by one.

**Where `stride` puts the second copy, and why it is drawn as rows 2–3.** `stride` is
`size / far_copies`: half the device. Device stripe `S` is the first stripe of the second
half of every device, and nothing between stripe 1 and stripe S is touched by chunks
0–7 — those stripes belong to chunks 8 and up. For the drawing, each device is collapsed
to the stripes actually in use: the near region's two stripes become rows 0–1 and the far
region's two stripes become rows 2–3, with the gap of `S − 2` unused stripes elided. Read
`row 2` as "device stripe S" and `row 3` as "device stripe S + 1".

## Table

```golden
name: raid10-far-4
disks: 4
0: D0 D1 D2 D3      # near region, device stripe 0
1: D4 D5 D6 D7      # near region, device stripe 1
2: M3 M0 M1 M2      # far region, device stripe S = stride / chunk size
3: M7 M4 M5 M6      # far region, device stripe S + 1
```

## Conventions of the sandbox

- **`D` versus `M`.** The kernel's copies are equals: `__raid10_find_phys()` fills
  `devs[0..copies-1]` and nothing in the geometry ranks them; reads may be served from any
  of them. The sandbox draws the *first-placed* copy (`n = 0`, `f = 0`, i.e. slot 0 — here
  the one in the near region) as the "original" `D<c>` and the far copy as `M<c>`. That is
  a choice made for the drawing, not a fact of the layout.
- **The far region is collapsed.** Rows 2–3 are *not* device stripes 2–3. On a real
  device the far section starts halfway down (`stride = size / far_copies`), and rows 2–3
  of the table are device stripes S and S + 1 where S is half the device in chunks. The
  drawing removes the unused stripes in between so that the far region begins immediately
  under the near region. Any drawing that separates the two regions (a gap, a divider, a
  label) is faithful; one that puts the far copies on device stripes 2–3 is not.
- **Rows are stripes of one chunk.** The sector offset within a chunk is taken as 0; a row
  is one chunk deep on every disk.
- **Original layout only.** The table is for `layout >> 17 == 0` (`far_set_size =
  raid_disks`). The "far sets" variants (bits 17–18) confine the shift to sets of
  `near_copies × far_copies` devices and would give a different far region on 4 disks
  (`[B A] [D C]` instead of `D A B C`); they are not derived here.
