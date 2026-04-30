// Agent Commerce — collector merge + dedupe.
//
// Multiple fetchers (github, npm, x402scan, agentic-market, manual seed)
// can all produce the "same" entity. The normalizer keys items by slug
// first, then resolves collisions by github / website host. Arrays are
// unioned, badges OR'd, sources concat'd.

import type {
  AgentCommerceItem,
  AgentCommerceSourceRef,
} from "./types";

export function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function dedupeStrings(arr: string[]): string[] {
  return Array.from(new Set(arr.filter((s) => typeof s === "string" && s.length > 0)));
}

function dedupeSources(
  refs: AgentCommerceSourceRef[],
): AgentCommerceSourceRef[] {
  const seen = new Map<string, AgentCommerceSourceRef>();
  for (const ref of refs) {
    const key = `${ref.source}|${ref.url}`;
    const prior = seen.get(key);
    if (!prior || ref.signalScore > prior.signalScore) {
      seen.set(key, ref);
    }
  }
  return Array.from(seen.values());
}

function pickEarlier(a: string, b: string): string {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta)) return b;
  if (!Number.isFinite(tb)) return a;
  return ta < tb ? a : b;
}

function pickLater(a: string, b: string): string {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta)) return b;
  if (!Number.isFinite(tb)) return a;
  return ta > tb ? a : b;
}

export function mergeItems(
  a: AgentCommerceItem,
  b: AgentCommerceItem,
): AgentCommerceItem {
  return {
    id: a.id,
    slug: a.slug,
    name: a.name.length >= b.name.length ? a.name : b.name,
    brief: a.brief.length >= b.brief.length ? a.brief : b.brief,
    kind: a.kind,
    category: a.category,
    protocols: dedupeStrings([...a.protocols, ...b.protocols]) as typeof a.protocols,
    pricing:
      a.pricing.type !== "unknown"
        ? a.pricing
        : b.pricing.type !== "unknown"
          ? b.pricing
          : a.pricing,
    capabilities: dedupeStrings([...a.capabilities, ...b.capabilities]),
    links: {
      website: a.links.website ?? b.links.website,
      github: a.links.github ?? b.links.github,
      docs: a.links.docs ?? b.links.docs,
      portalManifest: a.links.portalManifest ?? b.links.portalManifest,
      callEndpoint: a.links.callEndpoint ?? b.links.callEndpoint,
    },
    badges: {
      portalReady: a.badges.portalReady || b.badges.portalReady,
      agentActionable: a.badges.agentActionable || b.badges.agentActionable,
      x402Enabled: a.badges.x402Enabled || b.badges.x402Enabled,
      mcpServer: a.badges.mcpServer || b.badges.mcpServer,
      verified: a.badges.verified || b.badges.verified,
    },
    scores: a.scores.composite >= b.scores.composite ? a.scores : b.scores,
    sources: dedupeSources([...a.sources, ...b.sources]),
    firstSeenAt: pickEarlier(a.firstSeenAt, b.firstSeenAt),
    lastUpdatedAt: pickLater(a.lastUpdatedAt, b.lastUpdatedAt),
    tags: dedupeStrings([...a.tags, ...b.tags]),
  };
}

export function normalizeItems(
  items: AgentCommerceItem[],
): AgentCommerceItem[] {
  const bySlug = new Map<string, AgentCommerceItem>();
  const byGithub = new Map<string, string>();
  const byHost = new Map<string, string>();

  for (const raw of items) {
    const slug = raw.slug || makeSlug(raw.name);
    let key = slug;

    if (raw.links.github) {
      const ghKey = raw.links.github.toLowerCase();
      if (byGithub.has(ghKey)) {
        key = byGithub.get(ghKey)!;
      } else {
        byGithub.set(ghKey, slug);
      }
    }

    if (raw.links.website) {
      const host = safeHost(raw.links.website);
      if (host) {
        if (byHost.has(host) && !raw.links.github) {
          key = byHost.get(host)!;
        } else if (!byHost.has(host)) {
          byHost.set(host, slug);
        }
      }
    }

    const prior = bySlug.get(key);
    if (prior) {
      bySlug.set(key, mergeItems(prior, { ...raw, slug }));
    } else {
      bySlug.set(key, { ...raw, slug });
    }
  }

  return Array.from(bySlug.values());
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
