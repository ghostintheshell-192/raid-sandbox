// Ambient declarations for the editor-level type check (jsconfig.json).
// The engine files run both in the browser and under Node, and touch two Node
// globals behind `typeof` guards. Without @types/node (this repo has no
// node_modules, by design) the checker would not know them. Type-only: this
// file is never loaded at runtime.
declare var require: (id: string) => any;
declare var Buffer: any;
