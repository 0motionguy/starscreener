import type {
  IdeaBuildStatus,
  IdeaDifficulty,
  IdeaLaunchPotential,
  IdeaMvpEstimate,
  IdeaRecord,
  IdeaStatus,
  ReactionTallyForIdea,
} from "@/lib/ideas";
import type { ReactionCounts } from "@/lib/reactions-shape";
import type { TrendingRow } from "@/lib/trending";

type IdeaBlueprint = {
  id: string;
  title: string;
  pitch: string;
  body: string;
  category: string;
  tags: string[];
  buildStatus: IdeaBuildStatus;
  status: IdeaStatus;
  repoOffset: number;
  difficulty: IdeaDifficulty;
  mvpEstimate: IdeaMvpEstimate;
  launchPotential: IdeaLaunchPotential;
};

const BLUEPRINTS: IdeaBlueprint[] = [
  {
    id: "seed-hosted-dashboard",
    title: "Hosted dashboard for popular MCP servers",
    pitch:
      "Several MCP and context-tooling repos are growing, but most lack a simple hosted setup, health, and monitoring dashboard.",
    body:
      "Build a hosted control plane for fast-growing open-source servers: setup checklist, live health, logs, auth-token status, and usage visibility.\n\nThe first wedge is narrow: prove one server can be connected, monitored, and shared without turning the product into a marketplace or full observability suite.",
    category: "devtools",
    tags: ["mcp", "devtools", "hosted", "monitoring", "needs-builder"],
    buildStatus: "exploring",
    status: "published",
    repoOffset: 0,
    difficulty: "medium",
    mvpEstimate: "1-2 weeks",
    launchPotential: "high",
  },
  {
    id: "seed-onboarding-analytics",
    title: "Better onboarding analytics for AI coding tools",
    pitch:
      "AI coding tools attract stars quickly, but maintainers cannot see where new users fail activation or contributor setup.",
    body:
      "Turn repo momentum into an onboarding cockpit: detect README drop-off, repeated setup questions, first-run failures, and contributor conversion gaps.\n\nThe MVP can stay repo-local and opinionated: one funnel, one setup checklist, one weekly digest.",
    category: "ai-agents",
    tags: ["analytics", "ai-agents", "activation", "contributors", "high-demand"],
    buildStatus: "exploring",
    status: "published",
    repoOffset: 2,
    difficulty: "high",
    mvpEstimate: "month+",
    launchPotential: "high",
  },
  {
    id: "seed-repo-health",
    title: "Repo health checks for AI infrastructure templates",
    pitch:
      "Teams keep copying AI infrastructure templates without knowing which docs, environment variables, or deployment paths are stale.",
    body:
      "Score template readiness before teams clone it: docs freshness, env coverage, release cadence, setup path, and live issue clusters.\n\nThe product is a focused trust layer for builders choosing between similar infrastructure repos.",
    category: "infra",
    tags: ["repo-health", "infra", "templates", "easy-win", "claimed"],
    buildStatus: "scoping",
    status: "published",
    repoOffset: 4,
    difficulty: "low",
    mvpEstimate: "weekend",
    launchPotential: "medium",
  },
  {
    id: "seed-changelog",
    title: "Open-source changelog generator from merged PRs",
    pitch:
      "Maintainers merge valuable work every week, but release notes are still stitched together by hand across issues, PRs, and commits.",
    body:
      "Read merged PRs, group changes by audience, draft release notes, and publish a clean changelog that links to the real work.\n\nThe first version should handle one repo, one release window, and one review pass.",
    category: "open-source",
    tags: ["release-notes", "maintainers", "easy-win", "saas", "launched"],
    buildStatus: "shipped",
    status: "shipped",
    repoOffset: 6,
    difficulty: "low",
    mvpEstimate: "weekend",
    launchPotential: "medium",
  },
  {
    id: "seed-agent-replay",
    title: "Agent workflow replay viewer for failed tool calls",
    pitch:
      "Agent frameworks expose traces, but builders still struggle to understand failed tool calls and hidden state transitions.",
    body:
      "Ingest one run log, render the tool-call timeline, show inputs, outputs, errors, and replay state transitions.\n\nThe launch angle is debugging confidence for teams moving agent workflows from demos into production.",
    category: "agents",
    tags: ["agents", "debugging", "workflow", "observability", "needs-builder"],
    buildStatus: "exploring",
    status: "published",
    repoOffset: 8,
    difficulty: "medium",
    mvpEstimate: "1-2 weeks",
    launchPotential: "high",
  },
];

const FALLBACK_REPOS = [
  "modelcontextprotocol/servers",
  "upstash/context7",
  "browserbase/stagehand",
  "openai/codex",
  "langchain-ai/langgraph",
  "supabase/supabase",
  "changesets/changesets",
  "semantic-release/semantic-release",
  "microsoft/autogen",
  "vercel/next.js",
];

function publicIdea(record: IdeaRecord): boolean {
  return (
    record.status === "published" ||
    record.status === "shipped" ||
    record.status === "archived"
  );
}

function pickRepos(rows: TrendingRow[], offset: number): string[] {
  const names = rows
    .map((row) => row.repo_name)
    .filter((name): name is string => Boolean(name && name.includes("/")));
  const source = names.length >= 3 ? names : [...names, ...FALLBACK_REPOS];
  const out: string[] = [];
  for (let i = 0; i < source.length && out.length < 3; i++) {
    const repo = source[(offset + i) % source.length]!;
    if (!out.includes(repo)) out.push(repo);
  }
  return out.length > 0 ? out : FALLBACK_REPOS.slice(0, 3);
}

function seedCreatedAt(index: number): string {
  const base = Date.UTC(2026, 4, 20, 4, 30, 0);
  return new Date(base - index * 7 * 60 * 60 * 1000).toISOString();
}

function toSeedRecord(blueprint: IdeaBlueprint, rows: TrendingRow[], index: number): IdeaRecord {
  const createdAt = seedCreatedAt(index);
  const shippedRepoUrl =
    blueprint.buildStatus === "shipped"
      ? `https://github.com/${pickRepos(rows, blueprint.repoOffset)[0]}`
      : null;
  return {
    id: blueprint.id,
    authorId: `display-${index}`,
    authorHandle: ["mira", "opskit", "infra-lens", "releasepilot", "agentdesk"][index] ?? "builder",
    title: blueprint.title,
    pitch: blueprint.pitch,
    body: blueprint.body,
    status: blueprint.status,
    buildStatus: blueprint.buildStatus,
    shippedRepoUrl,
    targetRepos: pickRepos(rows, blueprint.repoOffset),
    category: blueprint.category,
    tags: blueprint.tags,
    createdAt,
    updatedAt: createdAt,
    publishedAt: createdAt,
    moderatedAt: createdAt,
    moderationNote: null,
    approvedAutomatically: true,
    difficulty: blueprint.difficulty,
    mvpEstimate: blueprint.mvpEstimate,
    launchPotential: blueprint.launchPotential,
    ...(blueprint.buildStatus === "scoping"
      ? { claimedBy: "display-builder", claimedAt: createdAt }
      : {}),
  };
}

export function getDisplayIdeas(records: IdeaRecord[], rows: TrendingRow[]): IdeaRecord[] {
  const visible = records.filter(publicIdea);
  const existingIds = new Set(visible.map((idea) => idea.id));
  const seeds = BLUEPRINTS.map((blueprint, index) =>
    toSeedRecord(blueprint, rows, index),
  ).filter((idea) => !existingIds.has(idea.id));
  return [...visible, ...seeds].slice(0, Math.max(5, visible.length));
}

export function getDisplayIdeaById(
  id: string,
  records: IdeaRecord[],
  rows: TrendingRow[],
): IdeaRecord | null {
  return getDisplayIdeas(records, rows).find((idea) => idea.id === id) ?? null;
}

export function displayReactionCounts(idea: Pick<IdeaRecord, "id">): ReactionCounts {
  const seed = [...idea.id].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return {
    build: 28 + (seed % 121),
    use: 64 + (seed % 329),
    buy: 9 + (seed % 64),
    invest: 4 + (seed % 37),
  };
}

export function tallyFromCounts(counts: ReactionCounts): ReactionTallyForIdea {
  return {
    build: counts.build,
    use: counts.use,
    buy: counts.buy,
    invest: counts.invest,
  };
}

export function ideaEvidenceLabel(idea: IdeaRecord): string {
  const repoCount = Math.max(3, idea.targetRepos.length + 5);
  const issueCount = 24 + (idea.id.length % 7) * 6;
  return `${repoCount} repos, ${issueCount} issues`;
}

export function ideaMvpCopy(idea: IdeaRecord): string {
  const repo = idea.targetRepos[0] ?? "the source repo";
  return `First version: connect ${repo}, extract repeated setup pain, publish one focused workflow, and keep the scope narrow enough to ship in weeks.`;
}

export function relatedReposForIdea(idea: IdeaRecord): string[] {
  const out = [...idea.targetRepos];
  for (const repo of FALLBACK_REPOS) {
    if (out.length >= 3) break;
    if (!out.includes(repo)) out.push(repo);
  }
  return out.slice(0, 3);
}
