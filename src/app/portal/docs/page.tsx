// StarScreener — /portal/docs
//
// UI front-door for the Portal v0.1 MCP/REST integration. Lives at
// /portal/docs because the API route (/portal) is already owned by
// src/app/portal/route.ts — that's the public manifest endpoint and we
// don't want a page component to shadow it.
//
// The server wrapper owns the metadata export; PortalDocsClient owns
// the interactive tab shell (Next 15 forbids `export const metadata`
// from a "use client" module).

import type { Metadata } from "next";
import PortalDocsClient from "./PortalDocsClient";

export const metadata: Metadata = {
  title: "MCP Portal — StarScreener",
  description:
    "Plug StarScreener's AI-repo trending index into any agent — Claude MCP, REST/JSON-RPC, no auth required.",
};

export default function PortalDocsPage() {
  return <PortalDocsClient />;
}
