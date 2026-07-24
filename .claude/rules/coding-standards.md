# Coding Standards

## JavaScript Standards

The codebase is vanilla ES5-compatible JavaScript with no build step, no
bundler, and no module loader. Match the surrounding code.

### Module pattern

Files are **IIFEs attached to a global namespace**, not ES modules:

```js
(function (root) {
  'use strict';

  const { setDrag, getDrag } = root.DragUtil;

  // ...

  root.RaidRender = { render, ... };
})(window);
```

- `'use strict'` at the top of every IIFE
- Dependencies are read off `root` at the top of the IIFE, not imported
- The public surface is assigned to `root.<Name>` at the bottom — one namespace
  per file, matching the file's purpose

### Naming

- **Factories over classes**: `createController({ ... })` returns an object
  literal of public methods
- **`_` prefix marks private**: `_handleDrop`, `_animating`, `_dragPayload` —
  local to the closure, never on the returned surface
- `camelCase` for functions and variables, `PascalCase` for namespaces
- Descriptive names over abbreviations

### Formatting

- **2-space indentation**, single quotes, semicolons
- Aligned assignment blocks where it aids reading:

  ```js
  let _animating   = false;
  let _stripes     = 4;
  let _dragPayload = null;
  ```

- Section separators between logical blocks:
  `// ---------------------------------------------------------------------------`

### File headers

Every source file opens with a JSDoc block that states **what the file is for,
what it does not do, and which spec or ground truth it answers to**:

```js
/**
 * layout.js — RAID Sandbox: headless data-placement engine (Phase 2a).
 *
 * This is the part that makes axis B verifiable: the grid it produces for
 * left-symmetric reproduces the hand-derived tables. The DOM animator plays
 * this grid; it does not compute it.
 */
```

The "does not do" half matters as much as the rest — it is what keeps
responsibilities from leaking between engine, render, and controller.

---

## Cross-Language Principles

### File Organization

- **One primary entity per file**: filename matches the namespace it exports
- **Predictable internal structure**: constants → private state → private
  helpers → public surface
- **Layering**: `src/engine/` is headless and must not reach into the DOM;
  `src/sandbox/` owns the DOM. The dependency points one way only.

### Documentation

- **Language**: English only
- **Public API**: documented with JSDoc
- **Focus**: Explain *why*, not *what*. Code already shows *what*; comments
  exist to capture intent and constraints that aren't visible in the code.
- **Keep up-to-date**: a stale comment is worse than none

### Composition

- **Pass dependencies in** through the factory's options object; do not reach
  for globals mid-function
- **Validate early**: fail fast on invalid arguments at construction time

### Error Handling

- **Handle errors explicitly**: no swallowed exceptions, no silent fallbacks
- **Declared fallbacks are not silent**: where a fallback is deliberate (e.g. an
  unknown algorithm name falling back to the layout default), it must be
  *reported* in the result, as `layout.js` does with `fallback`
- **Provide meaningful messages**: include enough context to diagnose

### Testing

- **Cover new behaviour with tests** before the feature is considered done
- **Descriptive test names**: a failing test name should explain what broke
- **AAA pattern** (Arrange / Act / Assert) or equivalent structural clarity
- Headless suites are standalone and dependency-free — see the golden-tables
  discipline in `principles.md` before writing any layout assertion
