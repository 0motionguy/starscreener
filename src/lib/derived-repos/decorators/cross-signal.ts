// Tier C cleanup: thin re-export so the orchestrator imports cross-signal
// from the same `decorators/` folder as twitter + producthunt for symmetry.
// The actual fusion logic lives in src/lib/pipeline/cross-signal.ts since
// it's also used outside the derived-repos pipeline (alert engine, queries).
// This module exists so a reader landing on derived-repos.ts sees three
// decorators imported from one folder rather than two folders.

export { attachCrossSignal as decorateWithCrossSignal } from "../../pipeline/cross-signal";
