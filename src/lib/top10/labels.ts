import type { Top10Window } from "./types";

const WINDOW_LABELS: Record<Top10Window, string> = {
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
  ytd: "YTD",
};

export function windowLabel(window: Top10Window): string {
  return WINDOW_LABELS[window];
}
