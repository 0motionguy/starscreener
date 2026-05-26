// StarScreener — Centralized toast helpers.
//
// Thin wrapper over `sonner` so the rest of the app imports a single
// surface. Keeps message wording consistent (watch/compare/share) and
// makes it trivial to swap transports later.
//
// All primitives accept an optional `ExternalToast` options bag (sonner's
// own type) so callers can pass `id`, `description`, `action`, etc. Each
// helper merges a sensible default duration (longer for errors, infinite
// for `loading` until the caller dismisses).

import { toast as sonnerToast, type ExternalToast } from "sonner";

/* ---------------------------------------------------------------------------
 * Primitive helpers
 * ------------------------------------------------------------------------- */

const baseStyle: ExternalToast = {
  duration: 4000,
};

export const toast = {
  success: (message: string, opts?: ExternalToast) =>
    sonnerToast.success(message, { ...baseStyle, ...opts }),
  error: (message: string, opts?: ExternalToast) =>
    sonnerToast.error(message, { ...baseStyle, duration: 6000, ...opts }),
  info: (message: string, opts?: ExternalToast) =>
    sonnerToast.info(message, { ...baseStyle, ...opts }),
  message: (message: string, opts?: ExternalToast) =>
    sonnerToast(message, { ...baseStyle, ...opts }),
  loading: (message: string, opts?: ExternalToast) =>
    sonnerToast.loading(message, { ...baseStyle, duration: Infinity, ...opts }),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
};

export type { ExternalToast };

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
  sonnerToast.success("Alert rule created");
}

export function toastAlertDeleted() {
  sonnerToast.info("Alert deleted");
}

export function toastAlertError(msg: string) {
  sonnerToast.error(msg);
}

export function toastRuleSaved() {
  sonnerToast.success("Saved");
}

export function toastWebhookSecretCopied() {
  sonnerToast.success("Secret copied to clipboard");
}

export function toastInviteSent() {
  sonnerToast.success("Invite link copied");
}
