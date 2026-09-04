# INDEX - Development Documentation

*A map of what exists and what each document is for.*
*For when and why something changed, ask git.*

---

## Quick Links

- [Current Status](CURRENT-STATUS.md)
- [Tech Debt](tech-debt/README.md)

---

## Development Documentation (.development/)

*Specs, tech-debt, decisions*

### (root)/ (4 files)

- [ARCHITECTURE.md](ARCHITECTURE.md) — Architecture Reference
- [CURRENT-STATUS.md](CURRENT-STATUS.md) — Current Status
- [INDEX.md](INDEX.md) — INDEX - Development Documentation
- [README.md](README.md) — .development

### specs/ (1 files)

- [README.md](specs/README.md) — Specs — what is written down, and what is not yet

### specs/implemented/ (2 files)

- [agnostic-engine.md](specs/implemented/agnostic-engine.md) — The agnostic engine — how the domain moved out of the code
- [raid-sandbox-domain-model.md](specs/implemented/raid-sandbox-domain-model.md) — RAID Sandbox — Domain Model (design backbone)

### specs/planned/ (3 files)

- [degenerate-levels.md](specs/planned/degenerate-levels.md) — Degenerate levels — what the player has, next to what they tried to build
- [derived-controller.md](specs/planned/derived-controller.md) — The controller is derived, not dragged
- [informative-ui.md](specs/planned/informative-ui.md) — Informative UI — the map of what needs explaining

### tech-debt/ (22 files)

- [README.md](tech-debt/README.md) — Tech Debt Issues
- [_TEMPLATE.md](tech-debt/_TEMPLATE.md) — [Issue Title]
- [algorithm-drop-ignores-class.md](tech-debt/algorithm-drop-ignores-class.md) — Dragging an algorithm chip onto an array ignores the array's class
- [algorithm-slot-vanishes-silently.md](tech-debt/algorithm-slot-vanishes-silently.md) — The algorithm slot disappears without saying why
- [algorithms-data-unvalidated.md](tech-debt/algorithms-data-unvalidated.md) — Three algorithm data files do not parse, and nothing would have noticed
- [automation-not-checked-on-windows.md](tech-debt/automation-not-checked-on-windows.md) — The hooks and dev scripts are authored and tested only on the Linux workstation
- [build-valid-claimed-with-hard-violations.md](tech-debt/build-valid-claimed-with-hard-violations.md) — The sandbox says "build valid" while showing a hard violation
- [canvas-nodes-are-unnamed.md](tech-debt/canvas-nodes-are-unnamed.md) — The canvas does not name the things the player builds
- [capacity-approximate-on-mixed-disks.md](tech-debt/capacity-approximate-on-mixed-disks.md) — Usable capacity is approximate when an array mixes disk sizes
- [control-path-tolerates-cycles.md](tech-debt/control-path-tolerates-cycles.md) — A control path that loops back on itself is accepted in silence
- [headless-tests-bypass-port-validation.md](tech-debt/headless-tests-bypass-port-validation.md) — `cpConnect` never checks port compatibility — headless tests wire canvases no player could draw
- [kb-intro-diverges-from-spec.md](tech-debt/kb-intro-diverges-from-spec.md) — The knowledge base teaches a vocabulary the spec does not use
- [level-numbers-duplicated-untested.md](tech-debt/level-numbers-duplicated-untested.md) — Level files declare numbers the engine also computes, and nothing compares them
- [nested-data-allocation-order.md](tech-debt/nested-data-allocation-order.md) — Tech debt — nested data-allocation order
- [nvme-hardware-raid-unbuildable.md](tech-debt/nvme-hardware-raid-unbuildable.md) — NVMe disks can never reach `engine-roc` — Hardware RAID over NVMe is unbuildable
- [nvme-software-raid-unbuildable.md](tech-debt/nvme-software-raid-unbuildable.md) — All-NVMe software RAID cannot be built — the recognizer demands an HBA the spec forbids
- [physical-layer-canvas-has-no-touch-picker.md](tech-debt/physical-layer-canvas-has-no-touch-picker.md) — The Physical Layer canvas never got the mobile tap-to-picker inversion
- [physical-recognizer-does-not-walk-the-path.md](tech-debt/physical-recognizer-does-not-walk-the-path.md) — The physical recognizer checks presence and one edge, not the path
- [ports-double-source-of-truth.md](tech-debt/ports-double-source-of-truth.md) — Component ports are defined twice, and the two environments read different copies
- [power-loss-warning-promised-not-implemented.md](tech-debt/power-loss-warning-promised-not-implemented.md) — The power-loss warning is promised in the data and was never written
- [raid0plus1-difference-not-surfaced.md](tech-debt/raid0plus1-difference-not-surfaced.md) — RAID 0+1 is recognized so the sandbox can say it is worse — and the sandbox never says it
- [refusal-tests-missing.md](tech-debt/refusal-tests-missing.md) — Three refusals have no test

### reference/ (4 files)

- [engine-robustness-and-extraction.md](reference/engine-robustness-and-extraction.md) — The composition engine — robustness audit and extraction map
- [physical-model-fidelity.md](reference/physical-model-fidelity.md) — Physical model vs. physical reality — fidelity audit
- [refusal-points.md](reference/refusal-points.md) — Refusal points — where the game says no, and whether it says why
- [unspoken-content.md](reference/unspoken-content.md) — Unspoken content — what the game knows and never says

### reference/decisions/ (2 files)

- [001-engine-identity-not-position.md](reference/decisions/001-engine-identity-not-position.md) — ADR-001: The RAID engine's type comes from which object it is, not where it sits
- [002-the-engine-holds-no-domain-facts.md](reference/decisions/002-the-engine-holds-no-domain-facts.md) — ADR-002: The engine holds no domain facts — it reads them from data files

---

## Public Documentation (docs/)

*Committed to git - user-facing documentation*

*docs/ folder not found*

---

*Run `python .development/scripts/generate-index.py` to regenerate*