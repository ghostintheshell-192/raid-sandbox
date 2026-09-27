# Position diagrams: where each physical component sits

**Status:** PLANNED — a prototype of the hardware diagram exists and its style is
approved (2026-09-27); nothing is in the repository yet
**Origin:** the idea note
[`2026-09-27-kb-component-position-diagrams`](../../../.memory-bank/ideas/2026-09-27-kb-component-position-diagrams.md),
raised while verifying the `bbu` page
**Touches:** the knowledge base (a figure on each physical page), the component
catalogue (`data/components/`), the physical plane of the game (axis A)

## What the diagrams are for

A learner who meets "backplane", "HBA" or "BBU" on a page has nothing to place the
word against. Each knowledge-base page of a physical component gets a drawing of a
real machine with the cover off, the page's component in colour and everything else
in grey line art.

A drawing answers two questions at once:

- **Where the component is**, in the machine a learner would open: the drives at the
  front, the backplane behind them, the controller card in a PCIe riser, and so on.
- **Where the RAID logic runs.** This is the one thing that tells hardware, firmware
  and software RAID apart (ADR-001), so every drawing marks it.

The topics match the CompTIA Server+ objectives (SK0-005, v5.0): objective 1.2 names
"Hardware vs. software" RAID, and objective 4.3 lists "Controller failure", "Host bus
adapter (HBA) failure" and "Backplane failure" among the causes of storage problems.

## Three diagrams, one per engine type

A component can sit in a different place, or be absent, depending on the engine type.
One drawing would force a choice, so there are three:

| engine type | machine | where the RAID logic runs |
|---|---|---|
| hardware | 2U rack server | the RAID-on-Chip on the controller card |
| firmware ("fake") | desktop PC | the CPU, through the driver; the chipset holds the metadata and boot support |
| software | to decide (see *Open questions*) | the operating system |

Every component page shows all three, with its own component highlighted. A component
missing from a diagram is information too: the software RAID diagram has no protected
cache, which is the point of the `bbu` page's section on interrupted writes.

## Where the positions come from

**Every position is copied from one vendor figure, never invented.** A drawing follows
one manual, the same way a golden table follows the kernel source: first the physical
truth from a source, then the drawing. Mixing two vendors would draw a machine that
does not exist.

**The hardware diagram follows the HPE ProLiant DL380 Gen10 User Guide** (Edition 14,
November 2021, document a00019109en_us):

| what | source | page |
|---|---|---|
| CPUs P1 and P2, 12 DIMM slots per processor (6 on each side), riser connectors, energy pack connector at the front edge | *System board components*; *DIMM slot locations* ("numbered sequentially (1 through 12) for each processor") | 25, 30 |
| six fans in a row behind the drive cage, air front to rear | *Fan bay numbering* | 43 |
| primary, secondary and tertiary riser cages and the two power supplies at the rear | *Rear panel components* | 23 |
| the energy pack as a separate module, cabled to the system board | *Installing a Smart Storage Battery*; "Connect the energy pack cable to the energy pack connector on the system board" | 117 |
| a type-p controller in a PCIe riser | "Type-p controllers install to a PCIe riser" | — |

**Chosen for the drawing, and said in the caption:**

- **The SAS cable's route.** The drawing joins the right parts; the path along the
  right side is ours.
- **The parts left out**: the tertiary riser (optional), the air baffle over the CPUs,
  the minor connectors. The drawing removes; it does not add.
- **The operating system** is drawn outside the chassis with a dashed border, because
  it is software.

**Variants for the caption's note.** Dell PowerEdge R750 can carry a "front PERC",
mounted directly behind the drive backplane instead of in a PCIe slot (R750
Installation and Service Manual, Rev. A05). A Broadcom CacheVault module can sit on
the card or on a remote mounting board.

**The firmware diagram** starts from the ASUS PRIME Z390-A user manual (E15017,
*1.1.2 Motherboard layout*, p. 1-2): CPU socket, DIMM slots, Intel Z390 chipset, SATA
ports, M.2 sockets, PCIe slots. The chipset's RAID is stated in the manual: "Intel®
Z390 Chipset support with Intel Rapid Storage Technology (RAID 0, 1, 5, 10)". The
tower around the board still needs a figure with the drive bays labelled.

## The drawing's style

Decided on the prototype, 2026-09-27:

- **Line art on a white background**, like a figure in a vendor manual.
- **Two stroke weights**: 1.5 for the outline of a part, 0.75 for its details (heat-sink
  fins, fan blades, leader lines). The SAS cable is drawn as a tube.
- **No fill** except the highlighted part and the drives' bodies.
- **One colour**, for the highlighted part and for the "RAID logic runs here" marker.
- **Labels beside the chassis**, joined to their part by a leader line: a name, and one
  line under it that says what the part is or where it is.
- **Front at the bottom, rear at the top**, as in the HPE and Dell figures.
- **The site's font, JetBrains Mono, embedded in each SVG.** An SVG shown through
  `<img>` loads nothing external. The font is cut down to the glyphs the drawing
  uses (about 3 KB per weight, weights 400 and 600). JetBrains Mono is under the SIL
  Open Font License; to confirm against the license text before the font file enters
  the repository.

## Shared with the physical plane

**The drawing of each component lives in the catalogue, once.** Today the physical
plane draws every component as a box with an emoji and a label. The silhouettes made
for the diagrams replace them, so the game and the knowledge base draw the same
object, and improving one improves the other.

**Each component declares where it is mounted** (for example `mount: pcie-riser`). The
catalogue knows today which component connects to which, not where each one sits.

**Each diagram is a saved build**, in the format of the game's save and share. A test
runs the physical recognizer on it and asserts the verdict: the hardware diagram must
be recognized as hardware RAID. If the game's model of hardware RAID changes, the
diagram's test fails.

**The BBU becomes a catalogue component** (decided 2026-09-27). Today the protected
cache is a capability of `engine-roc` (`power-loss-protection`). As an object, it can
be drawn, highlighted, and placed by the player.

**A correction the diagrams would make visible.** `engine-roc.yaml` describes the card
as including "BOTH the HBA AND a RAID-on-Chip". The verification of the `hba` page
found this wrong: a RAID controller is one chip. The catalogue text needs the same
correction the page received.

## Output

- The generator writes one SVG per page and engine type, `kb/img/<page>-<type>.svg`.
- A page shows each SVG with `<img>`, a descriptive `alt`, and a caption that says
  which engine type it shows, how to read it, the source, and what the drawing leaves
  out.
- The SVG carries its own `<title>`, `<desc>`, and a `<title>` on every part, for
  screen readers and for image search. Google indexes an SVG served as its own file;
  to check against Google's image guidelines before relying on it.

## Open questions

- **Mobile.** The drawing is 1000 × 870; at phone width its labels shrink to a few
  pixels. The proposal: on narrow screens the labels become numbers on the drawing,
  and the legend is an HTML list under the figure, readable at any width and
  indexable as text. Tapping the figure opens the full SVG to zoom. The generator
  would write both versions and a `<picture>` would choose.
- **A white figure on a dark site.** The knowledge base has only a dark theme. The
  figure could sit on a white card inside the dark page, or the generator could also
  write a dark version.
- **The battery's exact position.** The cable and the connector are certain; the
  drawing puts the pack just behind the fans, which the perspective figure on p. 117
  does not settle.
- **Which machine for software RAID.** The same server with an HBA instead of a RAID
  card, or a desktop using the chipset's SATA ports without the firmware RAID.
- **The logical layers** (`drive-group`, `span`, `virtual-drive`) have no physical
  place. A second family of diagrams, a stack of layers, later.

## Order of work

1. The catalogue: `mount`, the silhouettes, the BBU component, the `engine-roc` text.
2. The saved builds of the three configurations, with the recognizer test.
3. The generator for the hardware diagram, from the prototype.
4. The firmware diagram, then the software diagram, each from its figure.
5. The captions and the pages.
6. The physical plane adopts the silhouettes.

The prototype (scripts, SVGs, the figures it was drawn from) is kept locally in
`.memory-bank/journal/diagram-prototype/`.
