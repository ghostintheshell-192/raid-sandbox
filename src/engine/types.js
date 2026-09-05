// @ts-check
/// <reference path="../../types/ambient.d.ts" />
/**
 * types.js — RAID Sandbox: the engine's shapes, as JSDoc typedefs.
 *
 * No code. This file exists so the interfaces between the engine's modules —
 * and between the engine and the sandbox — are written down once, where an
 * editor can check them (`jsconfig.json`; a file opts in with `// @ts-check`).
 * It is a plain script, deliberately not a module, so its typedefs are global
 * to the project: any file can say `@param {TreeNode} node` without importing.
 *
 * The runtime knows nothing of this file: it is never loaded by index.html
 * or by a test. The sanctioned upgrade path is "TypeScript via @ts-check,
 * zero runtime change" (.claude/rules/overview.md), and this is it.
 */

// ---------------------------------------------------------------------------
// Axis B — the composition tree (model.js)
// ---------------------------------------------------------------------------

/** @typedef {'striped' | 'linear'} Segmentation */
/** @typedef {'none' | 'mirror' | 'parity1' | 'parity2'} Redundancy */

/**
 * A leaf: one physical disk. `protocol` is domain vocabulary ('SATA', 'SAS',
 * 'NVMe'), routed by the component catalogue's `accepts` lists.
 * @typedef {{ kind: 'disk', id: string, sizeGB: number, protocol: string }} Disk
 */

/**
 * An inner node. `members` are disks or arrays (recursion gives nesting);
 * `algorithm` is a placement choice within the array's class; `id` is the
 * canvas node it was compiled from, or null for a hand-built tree.
 * @typedef {{ kind: 'array', id: string | null, segmentation: Segmentation, redundancy: Redundancy,
 *             members: TreeNode[], algorithm: string | null, copies?: number }} ArrayNode
 */

/** @typedef {Disk | ArrayNode} TreeNode */

/**
 * What the recognizer answers: a name, or a first-class "valid but unnamed".
 * @typedef {{ level: string | null, recognized: boolean, notRaid: boolean,
 *             flag: 'non-standard-config' | null, reason: string }} Recognition
 */

/** @typedef {{ readMult: number, writeMult: number, readClass: PerfClass, writeClass: PerfClass }} PerfProfile */
/** @typedef {'high' | 'medium' | 'low'} PerfClass */

/**
 * `RaidModel.analyze()`: the recognition plus every derived property. The flat
 * keys are the challenge vocabulary (challenge.js reads them by name).
 * @typedef {Recognition & {
 *   diskCount: number, capacityGB: number, rawCapacityGB: number, faultTolerance: number,
 *   readClass: PerfClass, writeClass: PerfClass,
 *   performance: { writePenalty: number, parallelism: number, random: PerfProfile, sequential: PerfProfile }
 * }} Analysis
 */

// ---------------------------------------------------------------------------
// Placement (layout.js)
// ---------------------------------------------------------------------------

/** @typedef {{ role: 'data' | 'P' | 'Q' | 'mirror', seg: number | null, seq: number | null }} Cell */

/**
 * A grid to draw and animate, or an honest refusal. `fallback` is set when an
 * unknown algorithm name was replaced by the class default (spec §5b).
 * @typedef {{ columns: number, stripes: Cell[][], algorithm: string | null, fallback: string | null, unsupported?: undefined }
 *         | { unsupported: true, reason: string }} Placement
 */

// ---------------------------------------------------------------------------
// The level catalogue (levels.js)
// ---------------------------------------------------------------------------

/**
 * A shape from data/raid-levels/*.yaml: the grammar the recognizer matches.
 * @typedef {{ segmentation: Segmentation, redundancy: Redundancy, members: 'disks' | 'arrays',
 *             constraint?: 'even-disk-count' | 'odd-disk-count', copies?: number, childShape?: Shape }} Shape
 */

/**
 * A collapse rule (specs/planned/degenerate-levels.md §5): at `disks` members —
 * below the level's minDisks — the node is rewritten to the `becomes` shape.
 * `because` is the player-facing sentence, `source` the kernel line or the
 * algebra that grounds it.
 * @typedef {{ disks: number, becomes: { segmentation: Segmentation, redundancy: Redundancy },
 *             because: string, source: string }} Collapse
 */

/**
 * `advisory` is a soft, player-facing warning the level declares about ITSELF —
 * a legitimate shape the level's own file considers worse than a lookalike
 * (RAID 0+1 vs RAID 1+0). `{label}` is filled in by the validator, the same
 * convention as `reason`'s `{n}`.
 *
 * `minDisksToRun` is the width the real system still starts (a fact, with its
 * source), as opposed to `minDisks`, the level's definition; `collapsesTo` says
 * what the level becomes in between. Leaf levels only — a nested level's spans
 * carry the rule.
 * @typedef {{ id: string, name: string, notRaid?: boolean, reason: string, shape: Shape, minDisks: number,
 *             advisory?: string,
 *             minDisksToRun?: number, minDisksToRunSource?: string, collapsesTo?: Collapse[] }} LevelDef
 */

/**
 * @typedef {{ ids: () => string[], get: (id: string) => LevelDef | null, order: LevelDef[],
 *             match: (node: TreeNode) => LevelDef | null, matchShape: (node: TreeNode, shape: Shape) => boolean,
 *             reasonFor: (def: LevelDef, node: TreeNode) => string, manifest: { levels: LevelDef[] } }} Levels
 */

// ---------------------------------------------------------------------------
// Axis A — the control path (graph.js, catalog.js, physical.js)
// ---------------------------------------------------------------------------

/** @typedef {{ id: string, componentId: string, pos: { x: number, y: number } }} CpNode */
/** @typedef {{ id: string, fromNode: string, fromPort: string, toNode: string, toPort: string, derived?: boolean }} CpEdge */

/** @typedef {{ nodes: Map<string, { id: string, componentId: string | null }>, out: Map<string, string[]>, in: Map<string, string[]> }} Graph */

/** @typedef {{ id: string, dir: 'in' | 'out', type: string, accepts?: string[] }} Port */

/**
 * A component from data/components/*.yaml, as the catalogue holds it. Only
 * the model fields are typed; `ui` is whatever the file's ui: block says.
 * @typedef {{ id: string, name?: string, provides?: string[], ports: Port[],
 *             verdict?: { raidType: string, reason: string },
 *             layouts?: { reason: string },
 *             writeHole?: { reason: string },
 *             ui?: { label?: string, badge?: string, chip?: string, tooltip?: string, icon?: string, color?: string } }} ComponentDef
 */

/** @typedef {{ sink?: { capability: string, label?: string, article?: string } }} Roles */

/** @typedef {{ components: ComponentDef[], portTypes: Record<string, { connectsTo: string[] }>, roles?: Roles }} CatalogManifest */

/**
 * @typedef {{ ids: () => string[], has: (id: string) => boolean, get: (id: string) => ComponentDef | null,
 *             portsOf: (id: string) => Port[], portOf: (id: string, portId: string) => Port | null,
 *             provides: (id: string) => string[], providersOf: (capability: string) => string[],
 *             connectsTo: (outType: string) => string[],
 *             acceptorsOf: (protocol: string) => { componentId: string, portId: string }[],
 *             canConnect: (fromId: string, fromPort: string, toId: string, toPort: string) => CanConnect,
 *             roles: Roles, manifest: CatalogManifest }} Catalog
 */

/** @typedef {{ ok: true } | { ok: false, reason: string }} CanConnect */

/** A disk as the control-path recognizer sees it: a source, with its protocol. */
/** @typedef {{ id: string, protocol: string }} DiskRef */

/**
 * The physical verdict. `raidType` is the value the engine object declared
 * (hardware / fake / software in this domain); undetermined is null + `issue`.
 * @typedef {{ raidType: string | null, os: string | null, complete: boolean, issue: string | null,
 *             reason: string | null, engineNodeId: string | null }} Verdict
 */

/**
 * The derived view the validator consumes — never the raw cp* maps.
 * @typedef {{ raidType: string | null, os: string | null, engineCount: number,
 *             engineComponentId?: string | null,
 *             diskRoutes: { id: string, protocol: string, target: string | null }[] }} PhysicalView
 */

// ---------------------------------------------------------------------------
// Constraints (validator.js)
// ---------------------------------------------------------------------------

/**
 * @typedef {{ code: string, severity: 'hard' | 'soft', layer: 'data' | 'physical' | 'cross',
 *             message: string, nodeId: string | null, source: string }} Violation
 */

/** @typedef {{ hard: Violation[], soft: Violation[] }} Violations */

// ---------------------------------------------------------------------------
// The sandbox state and its document (canvas-state.js, build-document.js)
// ---------------------------------------------------------------------------

/** @typedef {{ kind: 'array', id: string, segmentation: Segmentation | null, redundancy: Redundancy | null,
 *              algorithm: string | null, members: string[] }} CanvasArray */
/** @typedef {Disk | CanvasArray} CanvasNode */

/**
 * @typedef {{ catalog: Catalog | null, levels: Levels | null, _seq: number,
 *             nodes: Map<string, CanvasNode>, roots: Set<string>, positions: Map<string, {x: number, y: number}>,
 *             selected: Set<string>, cpNodes: Map<string, CpNode>, cpEdges: Map<string, CpEdge>,
 *             cpDiskPositions: Map<string, {x: number, y: number}> }} SandboxState
 */

/**
 * `CanvasState.evaluate()`: everything the panels draw from, one call per gesture.
 * @typedef {{ tree: ArrayNode | null, analysis: Analysis | null, placement: Placement | null,
 *             rootCount: number, incomplete: boolean, firstIssue: string | null, violations: Violations,
 *             raidType?: string | null, os?: string | null, controlPathComplete?: boolean,
 *             controlPathIssue?: string | null, controlPathReason?: string | null, engineNodeId?: string | null }} EvalResult
 */

/**
 * Document v1 (build-document.js): the build, never its derivations.
 * @typedef {{ v: 1,
 *             disks: { id: string, sizeGB: number, protocol: string, physPos?: {x: number, y: number} }[],
 *             arrays: { id: string, segmentation: Segmentation | null, redundancy: Redundancy | null, algorithm: string | null, members: string[] }[],
 *             components: { id: string, componentId: string, pos: {x: number, y: number} }[],
 *             wires: { id: string, from: string, fromPort: string, to: string, toPort: string }[] }} BuildDoc
 */
