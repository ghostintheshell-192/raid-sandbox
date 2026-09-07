# Golden tables — the derivations behind what the sandbox draws

One document per layout. Each derives, **by hand from the kernel rule**, where every
chunk, parity block and copy of a small array goes, and ends in a table in the fixed
form below. `tests/layout-golden.test.js` reads that table and asserts the engine
against it — so the derivation here is the authority, the engine is what is checked,
and the table exists once.

The rule is quoted from the Linux kernel at a named version, with the function it is
in; the derivation applies it stripe by stripe; nothing here is produced by
`src/engine/layout.js` or copied from the test. Where a document and the engine
disagree, the kernel decides (ADR-004).

## The table form

A fenced block tagged `golden`:

```text
```golden
name: left-symmetric-raid5-4        # what the test asks for
disks: 4                            # cells per stripe
0: D0 D1 D2 P                       # stripe index: one cell per disk, disk 0 first
1: D4 D5 P  D3
```
```

Cells:

| cell   | meaning                                   | in the test     |
|--------|-------------------------------------------|-----------------|
| `D<n>` | data chunk *n* (0-based, in write order)  | role `data`, seg *n*   |
| `M<n>` | a further copy of chunk *n*               | role `mirror`, seg *n* |
| `P`    | parity                                    | role `P`, seg null     |
| `Q`    | the second syndrome of RAID 6             | role `Q`, seg null     |

Stripe indices start at 0 and are consecutive. `#` starts a comment. A document may
hold several tables (a level at two widths); names are unique across the directory.
Which copy of a mirrored chunk is drawn as `D` and which as `M` is a convention of the
sandbox, not of the kernel, and each document says so where it applies.
