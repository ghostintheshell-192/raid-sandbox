---
captured: 2026-07-24
status: open
context: "emerged during feature/mobile-inline-picker, while deciding the physical-layer scope (single vs multiple backplanes)"
tags: [scope, roadmap, physical-layer, datacenter]
---

# Two-level architecture: RAID builder → seal → datacenter tab

## The idea

Keep the current game to **a single backplane** and grow it, later, into a
second level rather than by adding multiple backplanes inside the builder:

1. The user builds a RAID group + its physical topology (one backplane) in the
   **builder** (today's game).
2. **`seal`** — the finished RAID becomes an immutable-but-reopenable *storage
   object*: a self-contained brick.
3. A **datacenter** page/tab collects the sealed objects; the user never rebuilds
   them, only arranges and connects them and assigns further properties.
4. **`edit`** reopens a sealed object back in the builder; changing it returns
   the edited object to the datacenter.
5. The user moves between the two views, accumulating storage objects (each with
   its own RAID + hardware) in the datacenter.

## Why it deserves attention

The **seal boundary coincides with the natural RAID↔datacenter boundary**: a RAID
is a fault domain *inside* its backplane; a datacenter is the *composition* of
fault domains. Sealing = "this fault domain is closed, it is now a brick." That
is where the physics changes scale, not an arbitrary cut — so the boundary holds
both didactically (learn RAID first, compose infra second) and architecturally.

It also lets us **cap today's scope without closing doors**: nothing datacenter
needs to be built (or even pre-wired) now. `roots` is already a Set, so multiple
independent RAID groups on one backplane are first-class state today.

## Contracts this hides (for when it's picked up)

- **seal** = serialize a self-contained storage object. State is already
  serializable (Map/Set of nodes); the work is *defining the object's boundary*
  (RAID tree + physical topology + derived capacity/properties).
- **edit** = load/hydrate a saved state into the builder, which today only starts
  from `reset`.
- Editing an object already wired in the datacenter can break downstream links
  (e.g. capacity change) → needs an invalidation policy. Most insidious node.
- Persistence (localStorage/export) vs the "shareable URL" goal: a whole
  datacenter challenges the short-URL objective.

## Minimal next step if resumed

Define the **sealed storage-object contract** (the serializable schema) first —
before any datacenter UI. Everything else derives from it.
