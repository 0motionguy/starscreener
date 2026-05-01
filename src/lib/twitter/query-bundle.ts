/**
 * @internal
 * Twitter query-bundle builder — consumed only by ./service.ts and re-exported
 * via TwitterSignalBuilder.buildTwitterQueryBundle in ./builder.ts. Do not
 * import from outside src/lib/twitter/.
 */
import type { TwitterQuery, TwitterRepoInput } from "./types";

const GENERIC_TERMS = new Set([
  "app",
  "apps",
  "api",
  "agent",
  "agents",
  "bot",
  "chat",
  "cli",
  "client",
  "code",
  "core",
  "data",
  "docs",
  "engine",
  "framework",
  "kit",
  "lib",
  "library",
  "model",
  "models",
  "plugin",
  "skill",
  "skills",
  "project",
  "repo",
  "sdk",
  "server",
  "service",
  "tool",
  "tools",
  "ui",
  "utils",
  "web",
]);

function normalizeTerm(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ");
}

function humanizeRepoName(repoName: string): string {
  return repoName
    .trim()
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isDistinctivePhrase(value: string): boolean {
  const normalized = normalizeTerm(value);
  if (normalized.length < 4) return false;
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0) return false;
  const distinctiveTokens = tokens.filter(
    (token) => token.length >= 4 && !GENERIC_TERMS.has(token),
  );
  return distinctiveTokens.length > 0;
}

function quoteForSearch(value: string): string {
  // Always quote so the search treats the phrase as an exact match.
  return `"${value}"`;
}

export function buildTwitterQueryBundle(input: TwitterRepoInput): TwitterQuery[] {
  const queries: TwitterQuery[] = [];
  const seen = new Set<string>();

  const add = (
    queryText: string | null | undefined,
    queryType: TwitterQuery["queryType"],
    tier: TwitterQuery["tier"],
    confidenceWeight: number,
    rationale: string,
    enabled = true,
  ): void => {
    const raw = String(queryText ?? "").trim();
    if (!raw) return;
    const key = `${queryType}:${raw.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    queries.push({
      queryText: raw,
      queryType,
      tier,
      confidenceWeight,
      enabled,
      rationale,
    });
  };

  const packageNames = input.packageNames ?? [];
  const aliases = input.aliases ?? [];
  const humanizedRepo = humanizeRepoName(input.repoName);
  const repoNameDistinctive = isDistinctivePhrase(input.repoName);
  const humanizedDistinctive = isDistinctivePhrase(humanizedRepo);

  // Tier 1: exact, highest-confidence lookups.
  add(
    input.githubFullName,
    "repo_slug",
    1,
    1,
    "Exact GitHub repo slug",
  );
  add(input.githubUrl, "repo_url", 1, 0.99, "Exact GitHub repo URL");
  add(
    input.homepageUrl,
    "homepage_url",
    1,
    0.97,
    "Exact homepage URL",
  );
  add(input.docsUrl, "docs_url", 1, 0.96, "Exact docs URL");
  for (const packageName of packageNames) {
    add(
      packageName,
      "package_name",
      1,
      0.98,
      "Exact package name",
    );
  }

  // Tier 2: quoted phrase matches that still anchor on the project.
  if (humanizedDistinctive) {
    add(
      quoteForSearch(humanizedRepo),
      "project_name",
      2,
      0.84,
      "Quoted project name",
    );
  }
  if (repoNameDistinctive) {
    add(
      quoteForSearch(input.repoName),
      "repo_short_name",
      2,
      0.8,
      "Quoted repo short name",
    );
  }
  if (packageNames.some((value) => value.includes("/"))) {
    for (const packageName of packageNames) {
      add(
        quoteForSearch(packageName),
        "package_name",
        2,
        0.82,
        "Quoted scoped package name",
      );
    }
  }
  if (humanizedDistinctive) {
    add(
      quoteForSearch(`${input.ownerName} ${humanizedRepo}`),
      "owner_project_phrase",
      2,
      0.77,
      "Owner plus project phrase",
    );
  }

  // Tier 3: alias fallbacks, disabled when the phrase is too generic.
  add(
    input.repoName,
    "alias",
    3,
    repoNameDistinctive ? 0.58 : 0.25,
    "Normalized repo short name fallback",
    repoNameDistinctive,
  );
  for (const alias of aliases) {
    const distinctive = isDistinctivePhrase(alias);
    add(
      alias,
      "alias",
      3,
      distinctive ? 0.55 : 0.2,
      "Alias fallback",
      distinctive,
    );
  }

  queries.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return b.confidenceWeight - a.confidenceWeight;
  });
  return queries;
}

export function repoNameNeedsStrongContext(input: TwitterRepoInput): boolean {
  return !isDistinctivePhrase(input.repoName);
}
