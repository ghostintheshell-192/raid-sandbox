# Tech debt — nested data-allocation order

**Status:** mostly RESOLVED 2026-06-14 · **Area:** `games/raid/src/engine/layout.js` (`placeNested`)

## Resolution

The original concern (the nested global data ORDER was unverified) is resolved:

- **Per-span layout is now Linux-verified.** The data within each parity span follows the
  left-symmetric WRITE order (data right after parity, wrapping), hand-derived from
  `drivers/md/raid5.c` (`ALGORITHM_LEFT_SYMMETRIC`, and `ALGORITHM_ROTATING_N_CONTINUE`
  for the RAID6 Q-left/DDF variant). near is hand-derived from `raid10.c`.
- **The real bug was fixed:** `placeNested` numbered data in DISK order, breaking the
  write-order sequence. Now it numbers in write order. Golden tables in
  `layout-golden.test.js` [7] are hand-computed from the Linux rules (NOT dumped from the
  engine) and assert EXACT segs; the independent hand calc matches the engine.
- The `.personal` RAID 60 table had two hand-transcription issues (row 3 in disk order;
  row 2 spans swapped), now corrected in `segment-allocation-rule-left-symmetric.md`.

## Residual (minor, by design)

The **cross-span** order — which span receives which span-stripe — is NOT defined by the
Linux kernel (the kernel defines only the layout *within* a span; nesting is LVM/hardware
stacking). We fix it by convention: one span-stripe per span per round, **ascending span
order**, each span in write order. This is a reasonable, documented choice; a specific
hardware controller could interleave differently. Revisit only if we need to match a
particular controller's nesting. Not blocking.
