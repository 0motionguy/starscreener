// StarScreener — Portal v0.1 manifest assembly.
//
// Reads the tool registry from src/tools/ and produces the JSON document
// served at GET /portal. Validates at module load so a drift between the
// registry and the spec fails the Next.js build, not a runtime call.

import { readEnv } from "@/lib/env-helpers";
import { TOOLS } from "../tools";
import { validateManifest } from "./validate";

export interface PortalManifest {
  portal_version: "0.1";
  name: string;
  brief: string;
  tools: Array<{
    name: string;
    description: string;
    params: Record<
      string,
      { type: string; required?: boolean; description?: string }
    >;
  }>;
  call_endpoint: string;
  auth: "none";
  pricing: { model: "free" };
}

const BRIEF =
  "TrendingRepo indexes trending GitHub repos and surfaces breakouts, quiet-killers, and maintainer activity. Call top_gainers to see what's rising, search_repos to find specific projects, and maintainer_profile to aggregate a GitHub handle's owned repos across the index.";

/**
 * Build the manifest. Pass an absolute public base URL in production (e.g.
 * "https://trendingrepo.com") so `call_endpoint` is absolute. In local dev
 * we fall back to http://localhost:3023 for parity with `npm run dev`.
 */
export function buildManifest(baseUrl?: string): PortalManifest {
  const base =
    baseUrl ??
    readEnv("TRENDINGREPO_PUBLIC_URL", "STARSCREENER_PUBLIC_URL") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3023";
  const callEndpoint = `${base.replace(/\/$/, "")}/portal/call`;

  const tools = TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    params: t.portalParams as PortalManifest["tools"][number]["params"],
  }));

  return {
    portal_version: "0.1",
    name: "TrendingRepo",
    brief: BRIEF,
    tools,
    call_endpoint: callEndpoint,
    auth: "none",
    pricing: { model: "free" },
  };
}

// Fail-fast drift guard — if the registry-derived manifest doesn't validate
// against the v0.1 schema, throw at module load so the dev server / build
// fails loudly rather than serving a broken manifest.
{
  const probe = buildManifest("https://trendingrepo.com");
  const check = validateManifest(probe);
  if (!check.ok) {
    throw new Error(
      `[trendingrepo/portal] manifest fails v0.1 schema: ${check.errors.join("; ")}`,
    );
  }
}
