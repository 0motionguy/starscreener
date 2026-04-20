// StarScreener — /you profile landing.
//
// Zero-auth personal signal panel. Pulls local-only state (watchlist +
// compare + filters) out of zustand and renders a compact "what you've
// been tracking" summary. All state is client-persisted via localStorage
// — there is no server-side account yet.
//
// Server wrapper owns the metadata export; the interactive shell lives
// in ./YouClient because Next.js 15 forbids `export const metadata` from
// a "use client" module.

import type { Metadata } from "next";
import YouClient from "./YouClient";

export const metadata: Metadata = {
  title: "Your signal — StarScreener",
  description:
    "Personal watchlist, compare shortlist, and saved filter summary. No account required — StarScreener keeps your signal local.",
};

export default function YouPage() {
  return <YouClient />;
}
