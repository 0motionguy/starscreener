// TrendingRepo - /portal/docs
//
// UI front-door for the Portal v0.1 MCP/REST integration. Lives at
// /portal/docs because the API route (/portal) is already owned by
// src/app/portal/route.ts - that's the public manifest endpoint and we
// do not want a page component to shadow it.
//
// The server wrapper owns the metadata export and collects tool metadata
// from the server-side registry. The client page only receives plain
// serializable fields.

import type { Metadata } from "next";
import PortalDocsClient, { type PortalDocsTool } from "./PortalDocsClient";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";

export const metadata: Metadata = {
  title: "MCP Portal - TrendingRepo",
  description:
    "Plug TrendingRepo's AI-repo trending index into any agent - Claude MCP, REST/JSON-RPC, no auth required.",
};

// Hard-coded tool metadata so the client bundle doesn't transitively
// pull in the pipeline query chain (which imports node:fs and crashes
// Turbopack's client bundler). Kept in sync with src/tools/index.ts —
// if the registry grows, reflect the new tool here.
const TOOLS: PortalDocsTool[] = [
  {
    name: "top_gainers",
    description:
      "Top N repos ranked by star delta over a window (24h / 7d / 30d). Fastest way to see what's breaking out on GitHub this week.",
    portalParams: {
      window: {
        type: "string",
        description: "'24h' | '7d' | '30d'. Default '7d'.",
      },
      limit: {
        type: "number",
        description: "1-50. Default 10.",
      },
      language: {
        type: "string",
        description:
          "Filter to a single primary language (e.g. 'Python', 'TypeScript'). Optional.",
      },
    },
  },
  {
    name: "search_repos",
    description:
      "Full-text search across repo fullName, description, and topics. Sorted by momentum score desc.",
    portalParams: {
      query: {
        type: "string",
        required: true,
        description:
          "Case-insensitive substring matched against fullName + description + topics.",
      },
      limit: {
        type: "number",
        description: "1-50. Default 10.",
      },
    },
  },
  {
    name: "maintainer_profile",
    description:
      "Aggregate view of a maintainer: owned repos, total stars, top movers. Useful for 'who is shipping the hottest AI right now?'",
    portalParams: {
      owner: {
        type: "string",
        required: true,
        description: "GitHub username or organization slug.",
      },
    },
  },
];

export default function PortalDocsPage() {
  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-4">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>PORTAL · MCP · TOOLS
              </>
            }
            status={`${TOOLS.length} TOOL${TOOLS.length === 1 ? "" : "S"}`}
          />
        </div>
      </section>
      <PortalDocsClient tools={TOOLS} />
    </>
  );
}
