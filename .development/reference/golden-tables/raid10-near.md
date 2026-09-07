# Golden tables: RAID 10 near

**Layout** (`raid10-near-4`): 4 disks, near_copies = 2, far_copies = 1, far_offset = 0,
layout word `0x102` ("n2"), chunks 0..7, 4 stripes.
**Layout** (`raid10-near-3`): 3 disks, near_copies = 2, far_copies = 1, far_offset = 0,
layout word `0x102` ("n2"), chunks 0..5, 4 stripes.
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

/* drivers/md/raid10.c, setup_geo() */
	nc = layout & 255;
	fc = (layout >> 8) & 255;
	fo = layout & (1<<16);

/* drivers/md/raid10.c, __raid10_find_phys() */
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
			/* not entered: far_copies == 1 */
		}
		dev++;
		if (dev >= geo->raid_disks) {
			dev = 0;
			sector += (geo->chunk_mask + 1);
		}
	}
```

In words. The layout word `0x102` gives `nc = 0x102 & 255 = 2`, `fc = (0x102 >> 8) & 255 = 1`,
`fo = 0x102 & 0x10000 = 0`. With `far_copies = 1` each device has a single section, the
inner `for (f = 1; f < 1; …)` loop never runs, and `stride` plays no part. With
`far_offset = 0` the line `stripe *= far_copies` is skipped.

For logical chunk `c`, the kernel multiplies by `near_copies` (`chunk = 2c`) and divides by
`raid_disks`: the quotient is the stripe, the remainder the device of the first copy
(`sector_div` divides in place and returns the remainder). The outer loop then writes
`near_copies` copies on consecutive devices, starting at `dev`. After each copy it does
`dev++`; when `dev` reaches `raid_disks` it wraps to device 0 **and** advances `sector` by
one chunk, i.e. the next copy lands on the next stripe. So the stream of copies is simply
"each chunk twice, filling devices left to right, row by row" — RAID 0 over a stream in
which every chunk appears twice in a row.

## Derivation

Notation: `(disk, row)`. Working in whole chunks, `sector` is a multiple of the chunk size
and `row = sector / chunk size`.

### 4 disks (`raid10-near-4`)

`chunk = 2c`, `stripe = 2c ÷ 4`, `dev = 2c mod 4`. Since 2c is even and 4 is even, `dev` is
0 or 2 and `dev + 1` is never ≥ 4: the wrap never fires.

| c | chunk = 2c | stripe = 2c ÷ 4 | dev = 2c mod 4 | n = 0 (`D`) | dev++ | n = 1 (`M`) |
|---|---|---|---|---|---|---|
| 0 | 0  | 0 | 0 | (0, 0) | 1 | (1, 0) |
| 1 | 2  | 0 | 2 | (2, 0) | 3 | (3, 0) |
| 2 | 4  | 1 | 0 | (0, 1) | 1 | (1, 1) |
| 3 | 6  | 1 | 2 | (2, 1) | 3 | (3, 1) |
| 4 | 8  | 2 | 0 | (0, 2) | 1 | (1, 2) |
| 5 | 10 | 2 | 2 | (2, 2) | 3 | (3, 2) |
| 6 | 12 | 3 | 0 | (0, 3) | 1 | (1, 3) |
| 7 | 14 | 3 | 2 | (2, 3) | 3 | (3, 3) |

Row by row: row 0 holds chunks 0 and 1 (each twice), row 1 chunks 2 and 3, row 2 chunks
4 and 5, row 3 chunks 6 and 7. Disks 0–1 are a mirrored pair, disks 2–3 another: this is
the RAID 1+0 picture.

### 3 disks (`raid10-near-3`)

`chunk = 2c`, `stripe = 2c ÷ 3`, `dev = 2c mod 3`. Now `dev` can be 2, and `dev + 1 = 3 ≥
raid_disks`: the wrap fires, and the second copy of that chunk goes to device 0 of the
**next** row.

| c | chunk = 2c | stripe = 2c ÷ 3 | dev = 2c mod 3 | n = 0 (`D`) | dev++ | wrap? | n = 1 (`M`) |
|---|---|---|---|---|---|---|---|
| 0 | 0  | 0 | 0 | (0, 0) | 1 | no | (1, 0) |
| 1 | 2  | 0 | 2 | (2, 0) | 3 | **yes** → dev = 0, sector += chunk | (0, 1) |
| 2 | 4  | 1 | 1 | (1, 1) | 2 | no | (2, 1) |
| 3 | 6  | 2 | 0 | (0, 2) | 1 | no | (1, 2) |
| 4 | 8  | 2 | 2 | (2, 2) | 3 | **yes** → dev = 0, sector += chunk | (0, 3) |
| 5 | 10 | 3 | 1 | (1, 3) | 2 | no | (2, 3) |

The two wraps (c = 1 and c = 4): the first copy is the last cell of a row, the second is
the first cell of the next row. Six chunks × two copies = twelve cells = four rows of three,
with no gap. Every chunk is still on two different devices; no device holds both copies of
a chunk — this is the layout sold as "RAID 1E" (a mirror striped across an odd number of
disks), and to the kernel it is simply near_copies = 2 on 3 disks.

## Tables

```golden
name: raid10-near-4
disks: 4
0: D0 M0 D1 M1
1: D2 M2 D3 M3
2: D4 M4 D5 M5
3: D6 M6 D7 M7
```

```golden
name: raid10-near-3
disks: 3
0: D0 M0 D1
1: M1 D2 M2
2: D3 M3 D4
3: M4 D5 M5
```

## Conventions of the sandbox

- **`D` versus `M`.** The kernel's copies are equals: `__raid10_find_phys()` fills
  `devs[0..copies-1]` and nothing in the geometry ranks them; reads may be served from any
  of them. The sandbox draws the *first-placed* copy (`n = 0`, `f = 0`, i.e. slot 0) as
  the "original" `D<c>` and every further copy as `M<c>`. That is a choice made for the
  drawing, not a fact of the layout.
- **Rows are stripes of one chunk.** The sector offset within a chunk is taken as 0; a row
  is one chunk deep on every disk.
- **The wrap is real, the row it lands on is the kernel's.** In `raid10-near-3` the second
  copy of chunks 1 and 4 sits on the next row because `sector += (chunk_mask + 1)` moves it
  there — this is not a drawing convention.
- **No far region.** With `far_copies = 1` there is one section per device and nothing
  is collapsed or elided in the drawing; the four rows are the first four stripes of the
  device.
