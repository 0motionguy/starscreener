// /skills taxonomy — the 4 awesome-* curator lists that ship the underlying
// skills surface. Source: data/awesome-skills.json `lists` array (populated
// daily by scripts/scrape-awesome-skills.mjs). Curator membership lives on
// each EcosystemLeaderboardItem under `awesomeLists` (full owner/repo IDs);
// this module converts those to URL-safe slugs and human labels.
//
// Used by:
//   - /skills/page.tsx — 5-tab filter strip (All + 4 lists)
//   - /skills/[slug]/page.tsx — "appears in: X, Y" badge strip
//
// Add a new list by appending to LIST_SLUGS + LIST_FULL_IDS + LIST_LABELS.
// The reverse-lookup map auto-derives.

export const LIST_SLUGS = [
  "antigravity",
  "awesome-claude-code",
  "punkpeye-mcp",
  "wong2-mcp",
] as const;

export type ListSlug = (typeof LIST_SLUGS)[number];

export const LIST_FULL_IDS: Record<ListSlug, string> = {
  antigravity: "sickn33/antigravity-awesome-skills",
  "awesome-claude-code": "hesreallyhim/awesome-claude-code",
  "punkpeye-mcp": "punkpeye/awesome-mcp-servers",
  "wong2-mcp": "wong2/awesome-mcp-servers",
};

export const LIST_LABELS: Record<ListSlug, string> = {
  antigravity: "Antigravity",
  "awesome-claude-code": "Awesome Claude Code",
  "punkpeye-mcp": "Punkpeye MCP",
  "wong2-mcp": "Wong2 MCP",
};

const FULL_ID_TO_SLUG: Record<string, ListSlug> = Object.fromEntries(
  Object.entries(LIST_FULL_IDS).map(([slug, fullId]) => [
    fullId.toLowerCase(),
    slug as ListSlug,
  ]),
);

export function isListSlug(value: string | null | undefined): value is ListSlug {
  if (!value) return false;
  return (LIST_SLUGS as readonly string[]).includes(value);
}

/**
 * Convert raw awesome-list full IDs (e.g. "sickn33/antigravity-awesome-skills")
 * onto the small set of stable URL slugs. Unknown / unrecognised list IDs are
 * dropped silently — when a new awesome-* list ships, taxonomy.ts has to
 * declare it explicitly to surface in the UI.
 */
export function resolveSkillLists(
  awesomeLists: ReadonlyArray<string> | null | undefined,
): ListSlug[] {
  if (!awesomeLists || awesomeLists.length === 0) return [];
  const slugs = new Set<ListSlug>();
  for (const fullId of awesomeLists) {
    if (typeof fullId !== "string") continue;
    const slug = FULL_ID_TO_SLUG[fullId.toLowerCase()];
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}
