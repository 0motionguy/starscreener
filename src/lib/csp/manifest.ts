// CSP manifest — TypeScript wrapper over the plain-JS source of truth.
//
// The actual host arrays live in `manifest-data.mjs` so that both
// next.config.ts (TS) and scripts/check-csp-completeness.mjs (plain
// Node) can import them — Node can't import .ts directly. This
// wrapper just adds types + re-exports.
//
// To add a new third-party host, edit manifest-data.mjs and run
// `npm run lint:csp` to confirm no codebase host is missed.

import * as data from "./manifest-data.mjs";

type DirectiveKey =
  | "defaultSrc"
  | "imgSrc"
  | "scriptSrc"
  | "styleSrc"
  | "fontSrc"
  | "workerSrc"
  | "connectSrc"
  | "frameSrc"
  | "frameAncestors"
  | "baseUri"
  | "formAction";

export const CSP_HOSTS = data.CSP_HOSTS as Readonly<Record<DirectiveKey, readonly string[]>>;

export function renderCsp(): string {
  return data.renderCsp();
}

export function allHttpsHosts(): string[] {
  return data.allHttpsHosts();
}
