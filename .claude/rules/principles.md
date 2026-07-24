# Development Principles

Core principles that apply to all work on this project.

---

## Core Philosophy

- **Functional minimalism**: Implement the minimum complexity necessary for current requirements
- **Incrementality**: Verify each change before proceeding, implement one component at a time
- **Responsiveness as requirement**: A blocked interface makes the application non-functional
- **Effective simplicity**: Prefer the simplest solution that works
- **Reversibility**: Return to working versions when optimizations compromise functionality

## Critical Approach

- Critically evaluate and question questionable assumptions
- For ambiguous questions: identify the unclear part and ask for direct clarification
- Do not develop elaborate explanations for possible interpretations of the question

---

## Development Workflow

When developing code or debugging, always follow these general rules:

1. **Development**: Work on one bug, feature, or thematically coherent development at a time
2. **Verification**: There is no build step — the gate is the headless suites
   (`tests/*.test.js`). Flag *what* to run; Valentina runs it (see `workflow.md`)
3. **User Testing**: Let the user test the changes from her perspective — for the
   canvas and the animations, in-browser is the only real test
4. **Atomic Commit**: Create a single, focused commit for the completed work

This cycle ensures:

- **Focus**: One logical change per iteration
- **Quality**: Immediate verification through tests and in-browser use
- **Traceability**: Clean commit history with atomic, reversible changes
- **Reliability**: Each commit represents a working state

---

## Ground Truth Before Implementation

RAID layouts are anchored to the Linux `md` kernel source (`drivers/md/raid5.c`,
`raid10.c`). For anything golden-tested:

- Derive the expected physical layout **by hand from the kernel rules first**,
  then assert the engine against it.
- **Never** regenerate a golden table from the engine. A golden table produced by
  the code under test asserts only that the code agrees with itself.

This is the project's most important discipline: the whole point of the sandbox
is that what it shows is *true*, not merely self-consistent.

---

## Technology Compatibility

- The project is **zero runtime dependencies** by design; the headless tests must
  not require YAML parsing or any package
- Explicitly list compatibility requirements before suggesting any library
- Compare alternatives highlighting compatibility advantages/disadvantages
- Report potential integration problems before implementation

---

## State and Lifecycle Management

- Clearly define the possible states of each component
- Document allowable state transitions
- Properly manage resource cleanup (listeners, timers, animation frames)
- Avoid inconsistent states or race conditions — the drag/tap/animation paths
  share state and are the place where these actually bite
