---
type: code-quality
priority: low
status: open
discovered: 2026-07-30
related: []
related_decision: null
---

# The hooks and dev scripts are authored and tested only on the Linux workstation

## Problem

On the Windows secondary machine, every fresh checkout marks `.githooks/*` and
`.development/automation/*.sh` / `.development/scripts/*` as modified — pure
`100755 → 100644` mode noise, zero content diff. NTFS has no Unix executable bit, so any
checkout here loses it, and `core.fileMode` (default `true`) reports the loss as a change.

Worked around locally (2026-07-30): `git config core.fileMode false` in this checkout.
That silences the symptom on this machine but is per-clone, not committed, and not a fix —
a fresh clone or a new secondary machine hits the same noise on day one.

## Analysis

The root issue is broader than the mode bit: `.githooks/` and `.development/automation/`
are bash + python, written and exercised on the primary Linux workstation. This is the
first symptom actually surfaced from the Windows side, not necessarily the only one —
shebang assumptions, path separators, or Python version differences in
`.development/scripts/*.py` haven't been audited against this machine at all. The global
config's own *Machine Notes* already flag `jq` and `gh` as absent here; this is the same
category of gap (tooling assumed present/uniform, never verified) one layer down, in the
scripts themselves rather than in what's installed.

## Possible Solutions

- **Option A**: `core.fileMode false` per clone (current workaround) — zero setup cost,
  but silent and per-machine; doesn't fix anything for a future clone or contributor.
- **Option B**: audit `.githooks/` and `.development/scripts/` for Windows/Git-Bash
  compatibility once, deliberately — confirm they actually run correctly here (not just
  that git stops complaining about them), and document the result.
- **Option C**: `.gitattributes` — does not apply. The executable bit is not something
  `.gitattributes` can restore on a filesystem that doesn't support it; it only helps with
  line-ending normalization, which is a separate (already-handled, `autocrlf=true`) concern.

## Recommended Approach

Option B, next time this project gets deliberate attention on this machine — worth doing
once, not per-session. Option A stays as the interim measure until then.

## Notes

Not urgent: nothing has broken, the hooks and scripts DO run here. This is a "was never
actually verified" gap, not a "known broken" one.

## Related Documentation

- **Machine context**: `C:\Users\micro\.claude\CLAUDE.md`, *Machine Notes* section
  (Windows secondary PC — missing `jq`, `gh`)
- **Code Locations**: `.githooks/`, `.development/automation/`, `.development/scripts/`
