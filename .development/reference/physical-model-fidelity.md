# Physical model vs. physical reality — fidelity audit

**Date**: 2026-07-30
**Scope**: every component in `data/components/`, the hard-coded `COMPONENTS` table and
`portsCompatible` matrix (`src/sandbox/physical-controller.js`), the auto-router and
recognizer (`src/sandbox/canvas-state.js`), the physical validator rules
(`src/engine/validator.js`), and the axis-A section of the domain-model spec (§2).

The sandbox's founding promise is that what it shows is *true*, not merely
self-consistent. Layouts answer to the Linux `md` kernel source; the physical layer has
no equivalent single source, so its claims need this audit instead: **what we model, what
is actually true, and which simplifications we accept — declared, never accidental.**

Verdict: the chain `disks → backplane → HBA → (engine) → PCIe → CPU → OS` is an honest,
server-shaped simplification. The engine-identity model (ADR-001) strengthened it. The
findings below are what remains: one internal contradiction, four undeclared
simplifications, four dead artifacts.

---

## 1. Internal contradiction

### 1.1 NVMe + software RAID cannot be built

- **We model**: spec §2 declares "NVMe bypasses backplane + controller" (hard); NVMe
  disks auto-route straight to the PCIe node.
- **What is true**: mdadm/ZFS over plain NVMe drives — no HBA anywhere — is the most
  common real-world software-RAID configuration today.
- **The contradiction**: `_recognizePhysicalLayer` requires an HBA between the disks and
  the engine unconditionally (`canvas-state.js`, the `hbaOnPath` gate). An all-NVMe build
  is refused with "Route the disks through an HBA" — demanding exactly what the spec says
  NVMe must not have. The game contradicts its own spec, not just reality.
- **Disposition**: bug, tracked in `tech-debt/nvme-software-raid-unbuildable.md`; the fix
  belongs to the ADR-001 implementation branch (the HBA requirement must apply to
  SATA/SAS paths only).

## 2. Undeclared simplifications

### 2.1 "The CPU computes" is taught nowhere

- **We model**: the CPU node is wiring — PCIe in, `cpu` out. The software-RAID verdict
  says "Linux computes the layout itself"; the OS, never the CPU.
- **What is true**: in software and fake RAID alike, the parity math is executed by the
  general-purpose CPU (kernel code / vendor driver). That is the single fact that makes
  fake RAID *fake*. The fake verdict names it ("the CPU still does the real work"); the
  software verdict does not.
- **Disposition**: near-zero-cost fix — recognizer reason strings and YAML descriptions
  (plus `element-popups.yaml`, already waiting for its visual channel). Implementation
  branch.

### 2.2 The backplane is mandatory; desktops do not have one

- **We model**: `cpAutoRoute` wires every SATA/SAS disk to a backplane node only. No
  backplane, no path — the backplane is de facto required.
- **What is true**: desktop disks cable directly to the chipset's SATA ports. The
  backplane is a server (hot-swap chassis) part.
- **Disposition**: declared here — **the physical layer models a server chassis**, which
  is the environment where RAID teaching makes sense. Not a bug; now no longer
  undeclared.

### 2.3 "NVMe bypasses the backplane" is electrically true, mechanically false in servers

- **We model**: the `nvme-backplane` hard rule — NVMe drives talk straight to the PCIe
  bus.
- **What is true**: hot-swap servers put NVMe drives on U.2/U.3 backplanes routinely —
  but those are *PCIe* backplanes: electrically the drive still speaks PCIe end-to-end,
  no protocol translation, no HBA. The game's backplane component models a **SAS/SATA
  backplane** specifically.
- **Disposition**: declared here; the component rename ("SAS/SATA backplane" in name or
  description) belongs to the implementation branch. With that said aloud, the rule is
  true without reservation.

### 2.4 SAS is a decorative palette chip

- **We model**: separate `SAS 2 TB` and `SATA 2/4 TB` disk chips — but
  `_diskTargetComponent` treats every non-NVMe protocol identically, and no port type,
  rule, or YAML distinguishes them anywhere.
- **What is true**: the asymmetry is teachable — a SATA drive works on SAS
  infrastructure (backplane/HBA), a SAS drive does **not** work on a SATA controller.
  Plus: dual-porting, expanders, longer cabling.
- **Disposition**: open. Either teach the asymmetry (a future validator rule), or declare
  the equivalence, or drop the chip until it means something. Decision deferred to the
  implementation branch; until then this line is the declaration.

### 2.5 The chipset/PCH does not exist in the model

- **We model**: HBA as a discrete piece; fake-RAID silicon as a discrete piece
  (post-ADR-001: the metadata-only chip).
- **What is true**: in ordinary PCs both roles live in the chipset — the AHCI SATA
  controller *is* the HBA function, and Intel RST *is* the chipset's RAID mode. The two
  "separate pieces in series" are one piece of silicon there.
- **Disposition**: known simplification, already declared in ADR-001 (Cons), accepted for
  teaching value. Adding a chipset/PCH node would fix this and §2.2 at the cost of one
  more mandatory node in every build — recorded as a future candidate, deliberately not
  pursued now.

## 3. Dead artifacts and mechanical risks

| finding | detail | disposition |
|---|---|---|
| `provides:`/`requires:` in component YAMLs | read by no code; pure documentation, including never-enforced claims (`os-linux requires: hba`) | **2026-09-02**: `provides` is read — the `os` capability marks the sink (`index.yaml` `roles`), and each engine object / OS declares its own `verdict:` block, which the recognizer reads instead of naming components (`engine/physical.js`). `requires` stays documentation until a rule reads it |
| `pcie-raid` port type | exists only inside `COMPATIBLE` (`physical-controller.js`); no port anywhere declares it | **removed 2026-09-02** — the relation now lives in `index.yaml` `portTypes`, and a type nobody declares fails `createCatalog` |
| ports defined twice | hard-coded `COMPONENTS` (JS) + `ui.ports` (YAML), byte-identical today; browser silently prefers YAML, headless uses JS — a future divergence splits behaviour between the two environments with no error | **resolved 2026-09-02** — YAML is the only runtime source; the headless mirror is a test fixture checked by `components-data.test.js` (`tech-debt/ports-double-source-of-truth.md`) |
| `raid-engine`'s `any` ports | the hole that makes cycles drawable (`tech-debt/control-path-tolerates-cycles.md`) | retiring the piece (ADR-001) removes the last `any` from the system; port typing becomes meaningful everywhere |

## 4. Verified and holding — no action

- `controller-hw` accepts the backplane directly (in: `routing`) with no separate HBA —
  faithful: a hardware RAID card includes the HBA function on the board.
- `virtual-drive` out of the RoC vs. raw `pcie` out of the metadata chip — the observable
  hardware/fake difference was already encoded in the port types before ADR-001 named it.
- NVMe cannot reach `controller-hw` (incompatible ports), so NVMe hardware RAID is
  unbuildable. Tri-mode controllers (e.g. Broadcom 9600) do exist; acceptable omission
  for the consumer-hardware scope, recorded here.
  **2026-09-02**: no longer an omission — `engine-roc-trimode.yaml` (provisional
  naming) accepts NVMe drives directly and yields the hardware verdict; resolved in
  `tech-debt/nvme-hardware-raid-unbuildable.md`.
- `backplane-diversity` is dormant and says so in the code ("not faked") — correct
  discipline.
- The v1 "no manual disk-wiring" simplification is declared in spec §2.

---

*Related: ADR-001 (`reference/decisions/001-engine-identity-not-position.md`),
`specs/planned/derived-controller.md` (Update 2026-07-30), spec §2
(`specs/implemented/raid-sandbox-domain-model.md`).*
