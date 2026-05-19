// TrendingRepo — app-wide identity constants.
//
// Single source of truth for the release version: the root `package.json`.
// Bump it there and every UI surface that imports `APP_VERSION` follows on
// the next build. `next.config.ts` re-exports the same value as
// `process.env.NEXT_PUBLIC_APP_VERSION` so client bundles can read it
// without re-importing the manifest.
//
// The Portal wire-protocol version (`portal_version` in
// `src/portal/manifest.ts`) is a separate axis — see /portal/docs.

import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;
export const APP_NAME = "TrendingRepo";
export const APP_TAGLINE = "The trend map for open source";
