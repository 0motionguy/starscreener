// StarScreener — Centralized toast helpers.
//
// Thin wrapper over `sonner` so the rest of the app imports a single
// surface. Keeps message wording consistent (watch/compare/share) and
// makes it trivial to swap transports later.

import { toast as sonnerToast } from "sonner";

/* ---------------------------------------------------------------------------
 * Primitive helpers
 * ------------------------------------------------------------------------- */

export const toast = {
  success(message: string) {
    sonnerToast.success(message);
  },
  error(message: string) {
    sonnerToast.error(message);
  },
  info(message: string) {
    sonnerToast.info(message);
  },
  message(message: string) {
    sonnerToast(message);
  },
};

/* ---------------------------------------------------------------------------
 * Domain-specific helpers
 * ------------------------------------------------------------------------- */

export function toastWatchAdded(fullName: string) {
  sonnerToast.success(`Added ${fullName} to watchlist`);
}

export function toastWatchRemoved(fullName: string) {
  sonnerToast.info(`Removed ${fullName} from watchlist`);
}

export function toastCompareAdded(count: number) {
  sonnerToast.success(`Added to compare (${count}/4)`);
}

export function toastCompareRemoved(count: number) {
  sonnerToast.info(`Removed from compare (${count}/4)`);
}

export function toastCompareFull() {
  sonnerToast.error("Compare is full — remove one first");
}

export function toastShareSuccess() {
  sonnerToast.success("Shared!");
}

export function toastShareCopied() {
  sonnerToast.success("Link copied to clipboard");
}

export function toastShareError() {
  sonnerToast.error("Could not share — try again");
}

export function toastRefreshSuccess(durationMs: number) {
  sonnerToast.success(`Pipeline refreshed — ${durationMs}ms`);
}

export function toastRefreshError() {
  sonnerToast.error("Refresh failed");
}

export function toastAlertCreated() {
  sonnerToast.success("Alert created");
}

export function toastAlertDeleted() {
  sonnerToast.info("Alert deleted");
}

export function toastAlertError(msg: string) {
  sonnerToast.error(msg);
}
