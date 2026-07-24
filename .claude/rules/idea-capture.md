# Idea Capture Rule

Convention for capturing tangential ideas that emerge in conversation
without derailing the current workflow.

## When to activate

**Explicit user triggers** (typical phrases):

- *"let's note it and move on"*
- *"save it for later"*
- *"not now, park it"*
- *"interesting but out of scope"*
- *"take a note and continue"*

**Proactive trigger from Claude**: when you sense a tangential thread
that has its own merit (worth future attention) but risks derailing
the main work, **ask** *"want me to note it as an idea to explore?"*
instead of following the tangent.

## How to capture

1. **Create a file** in `.memory-bank/ideas/` with filename pattern:
   `YYYY-MM-DD-<short-slug>.md` (today's date + brief descriptive slug)

2. **Required frontmatter**:

   ```yaml
   ---
   captured: YYYY-MM-DD
   status: open
   context: "brief description of where the idea emerged (workstream, branch, file)"
   tags: [tag1, tag2]
   ---
   ```

3. **Body** (short, focused — NOT a spec):
   - What the idea is
   - Why it deserves future attention
   - The minimal next-step if it's ever picked up

4. **Resume the main thread** — capture must be quick, not a detour.

## Allowed states (status)

- `open` — fresh capture
- `parked` — explicitly deferred for later
- `promoted-to-spec` / `promoted-to-tech-debt` / `promoted-to-adr` /
  `promoted-to-skill` — promoted to a durable artifact, link in the
  `promoted_to` field
- `dropped` — decided as not actionable

## Promote workflow

When an idea matures enough to become a spec or other durable structure:

1. Create the new artifact in its natural location
   (e.g. `.development/specs/planned/feature-X.md`)
2. **Update the idea note** — DO NOT delete it. Modify the frontmatter:
   ```yaml
   status: promoted-to-spec
   promoted_to: ../../.development/specs/planned/feature-X.md
   promoted_at: YYYY-MM-DD
   ```
3. The new artifact is the ground truth from that moment on. The idea
   note remains as a record of provenance.
