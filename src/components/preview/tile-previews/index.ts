// Barrel re-exports for the 12 launcher preview tile components.
// Each component is a deterministic JSX template — no props, no data —
// that emits a <div class="scrn-preview pv-<variant>"> with mockup-faithful
// inline preview art lifted from index.html.

export { PvTrending } from "./PvTrending";
export { PvBreakout } from "./PvBreakout";
export { PvSignals } from "./PvSignals";
export { PvDetail } from "./PvDetail";
export { PvAccount } from "./PvAccount";
export { PvDrop } from "./PvDrop";
export { PvTools } from "./PvTools";
export { PvMoney } from "./PvMoney";
export { PvM2M } from "./PvM2M";
export { PvMrr } from "./PvMrr";
export { PvIdeas } from "./PvIdeas";
export { PvBuild } from "./PvBuild";

export type PreviewVariant =
  | "trending"
  | "breakout"
  | "signals"
  | "detail"
  | "account"
  | "drop"
  | "tools"
  | "money"
  | "m2m"
  | "mrr"
  | "ideas"
  | "build";
