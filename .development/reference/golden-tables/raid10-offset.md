# Golden tables: RAID 10 offset

**Layout** (`raid10-offset-4`): 4 disks, near_copies = 1, far_copies = 2, far_offset = 1,
layout word `0x10201` ("o2"), chunks 0..7, 4 stripes (2 original + 2 copy, interleaved).
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
 *
 * If far_offset is true, then the far_copies are handled a bit differently.
 * The copies are still in different stripes, but instead of being very far
 * apart on disk, there are adjacent stripes.

/* drivers/md/raid10.h, struct geom */
		int		far_offset;   /* far_copies are offset by 1
					       * stripe instead of many
					       */
		sector_t	stride;	      /* distance between far copies.
					       * This is size / far_copies unless
					       * far_offset, in which case it is
					       * 1 stripe.
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

In words. The layout word `0x10201` gives `nc = 0x10201 & 255 = 1`, `fc = (0x10201 >> 8) &
255 = 2`, `fo = 0x10201 & 0x10000 = 0x10000` (true), and `0x10201 >> 17 = 0` selects the
original layout, so `far_set_size = raid_disks = 4`. As in the far case,
`last_far_set_start = 0`, `last_far_set_size = 4`, `raid_disks mod far_set_size = 0`, and
the inner loop's `else` branch applies with `set = 0`: the copy's device is
`(d + near_copies) mod 4`.

Two things change against far. First, `stride` is **one stripe** (one chunk in sectors),
not half the device: the copy of a chunk is on the very next stripe of the array. Second,
`far_offset` makes the kernel do `stripe *= far_copies` after the division, so the first
copies of chunks 0–3 land on stripe 0, of chunks 4–7 on stripe 2, and so on — every
other stripe is left free for the copies, which `stride` then fills in. The result is
that original rows and copy rows alternate, each copy row being the row above it rotated
one device to the right. Since every device holds the whole set of chunks twice at
adjacent stripes, capacity is that of `far`, but the copies are next to each other on
disk instead of half a device apart.

## Derivation

Notation: `(disk, row)`. Working in whole chunks, `stride = 1 row`.

`chunk = c` (near_copies = 1), `stripe = c ÷ 4`, `dev = c mod 4`, then `stripe = stripe × 2`
(far_offset). First copy at `(dev, stripe)`; the copy at `((dev + 1) mod 4, stripe + 1)`.

| c | chunk = c | c ÷ 4 | stripe = (c ÷ 4) × 2 | dev = c mod 4 | n = 0, f = 0 (`D`) | d = (dev + 1) mod 4 | s = stripe + 1 | f = 1 (`M`) |
|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 | (0, 0) | 1 | 1 | (1, 1) |
| 1 | 1 | 0 | 0 | 1 | (1, 0) | 2 | 1 | (2, 1) |
| 2 | 2 | 0 | 0 | 2 | (2, 0) | 3 | 1 | (3, 1) |
| 3 | 3 | 0 | 0 | 3 | (3, 0) | 4 mod 4 = 0 | 1 | (0, 1) |
| 4 | 4 | 1 | 2 | 0 | (0, 2) | 1 | 3 | (1, 3) |
| 5 | 5 | 1 | 2 | 1 | (1, 2) | 2 | 3 | (2, 3) |
| 6 | 6 | 1 | 2 | 2 | (2, 2) | 3 | 3 | (3, 3) |
| 7 | 7 | 1 | 2 | 3 | (3, 2) | 4 mod 4 = 0 | 3 | (0, 3) |

Row 0 is chunks 0–3 in RAID 0 order; row 1 is row 0 shifted right by one device; row 2 is
chunks 4–7; row 3 is row 2 shifted right by one. Nothing is elided: rows 0–3 are device
stripes 0–3, contiguous.

## Table

```golden
name: raid10-offset-4
disks: 4
0: D0 D1 D2 D3      # device stripe 0: originals of chunks 0-3
1: M3 M0 M1 M2      # device stripe 1: their copies, one device to the right
2: D4 D5 D6 D7      # device stripe 2: originals of chunks 4-7
3: M7 M4 M5 M6      # device stripe 3: their copies
```

## Conventions of the sandbox

- **`D` versus `M`.** The kernel's copies are equals: `__raid10_find_phys()` fills
  `devs[0..copies-1]` and nothing in the geometry ranks them; reads may be served from any
  of them. The sandbox draws the *first-placed* copy (`n = 0`, `f = 0`, i.e. slot 0 — the
  one on the even stripe) as the "original" `D<c>` and the copy one stripe down as `M<c>`.
  That is a choice made for the drawing, not a fact of the layout.
- **No collapsing.** Unlike `far`, the rows here are the device's actual stripes 0–3 in
  order; the alternation of original and copy rows is the kernel's, not the drawing's.
- **Rows are stripes of one chunk.** The sector offset within a chunk is taken as 0; a row
  is one chunk deep on every disk. `stride` being "1 stripe" means exactly one chunk in
  sectors on each device.
- **Original layout only.** The table is for `layout >> 17 == 0` (`far_set_size =
  raid_disks`). The "far sets" variants (bits 17–18) confine the one-device shift to sets
  of `near_copies × far_copies` devices and would give copy rows of `M1 M0 M3 M2` on 4
  disks; they are not derived here.
