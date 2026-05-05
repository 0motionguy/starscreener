import { getDataStore } from "@/lib/data-store";
import { parseManifestSnapshot } from "@/lib/manifest-store";
import { getBrief } from "@/lib/briefs";
import type { Repo } from "@/lib/types";

export type RepoCategoryKind = "mcp" | "skill" | "agent" | "library";

export interface RepoCategoryDetails {
  kind: RepoCategoryKind;
  mcp?: {
    tools: string[];
    resources: string[];
    installSnippet: string;
  };
  skill?: {
    frontmatter: Array<{ key: string; value: string }>;
    versionHistory: string[];
    bodyPreview: string;
  };
  agent?: {
    personaRole: string;
    capabilities: string[];
    exampleInvocations: string[];
  };
}

export function getCategoryKind(repo: Repo): RepoCategoryKind {
  return classifyRepoKind(repo);
}

const BRIEF_DIFFERENTIATION_LENSES: Record<RepoCategoryKind, string> = {
  mcp: "Surface tool surface area, resource catalog, and install ergonomics so operators can judge MCP fit at a glance.",
  skill: "Highlight skill frontmatter, version history, and body preview so reviewers can audit the prompt contract quickly.",
  agent: "Frame the agent persona, capability set, and example invocations to clarify when to delegate work to it.",
  library: "Emphasize API ergonomics, integration cost, and language fit so engineers know whether to depend on it.",
};

export function getBriefDifferentiationLens(kind: RepoCategoryKind): string {
  return BRIEF_DIFFERENTIATION_LENSES[kind];
}

function classifyRepoKind(repo: Repo): RepoCategoryKind {
  const lowerTopics = (repo.topics ?? []).map((t) => t.toLowerCase());
  const name = repo.name.toLowerCase();
  const full = repo.fullName.toLowerCase();

  if (repo.categoryId === "mcp" || lowerTopics.includes("mcp")) return "mcp";
  if (
    full.includes("skill") ||
    name.includes("skill") ||
    lowerTopics.some((t) => t.includes("skill"))
  ) {
    return "skill";
  }
  if (
    repo.categoryId === "ai-agents" ||
    lowerTopics.includes("agent") ||
    lowerTopics.includes("ai-agent")
  ) {
    return "agent";
  }
  return "library";
}

function readMcpResources(raw: unknown, itemId: string): string[] {
  if (!raw || typeof raw !== "object") return [];
  const root = raw as Record<string, unknown>;
  const manifests =
    root.manifests && typeof root.manifests === "object"
      ? (root.manifests as Record<string, unknown>)
      : null;
  const mcps = manifests?.mcps;
  if (!Array.isArray(mcps)) return [];
  const match = mcps.find((row) => {
    if (!row || typeof row !== "object") return false;
    const id = (row as Record<string, unknown>).id;
    return typeof id === "string" && id.toLowerCase() === itemId.toLowerCase();
  });
  if (!match || typeof match !== "object") return [];
  const resources = (match as Record<string, unknown>).resources;
  if (!Array.isArray(resources)) return [];
  const out: string[] = [];
  for (const r of resources) {
    if (typeof r === "string" && r.trim()) out.push(r.trim());
    else if (r && typeof r === "object") {
      const rec = r as Record<string, unknown>;
      const name =
        typeof rec.name === "string"
          ? rec.name
          : typeof rec.uri === "string"
            ? rec.uri
            : null;
      if (name && name.trim()) out.push(name.trim());
    }
  }
  return out.slice(0, 8);
}

export async function loadRepoCategoryDetails(
  repo: Repo,
): Promise<RepoCategoryDetails | null> {
  const kind = classifyRepoKind(repo);
  if (kind === "library") return null;

  const store = getDataStore();
  const manifestKey = `mcp-manifest:${repo.fullName.toLowerCase()}`;
  const manifestRead = await store.read<unknown>(manifestKey);
  const manifest = parseManifestSnapshot(manifestRead.data);

  if (kind === "mcp") {
    const mcpEntry = manifest.mcps.find(
      (m) => m.id === repo.fullName.toLowerCase() || m.id === repo.name.toLowerCase(),
    );
    const toolNames = (mcpEntry?.tools ?? []).map((t) => t.name).slice(0, 10);
    const resources = readMcpResources(manifestRead.data, mcpEntry?.id ?? repo.fullName);
    return {
      kind,
      mcp: {
        tools: toolNames,
        resources,
        installSnippet: `npx ${repo.name}`,
      },
    };
  }

  if (kind === "skill") {
    const skillEntry = manifest.skills.find(
      (s) => s.id === repo.fullName.toLowerCase() || s.name.toLowerCase().includes(repo.name.toLowerCase()),
    );
    const brief = await getBrief(repo.owner, repo.name);
    const frontmatter: Array<{ key: string; value: string }> = [];
    if (brief) {
      frontmatter.push({ key: "hook", value: brief.hook });
      frontmatter.push({ key: "what", value: brief.what });
      frontmatter.push({ key: "written_at", value: brief.written_at });
    }
    const versionHistory = [
      ...(skillEntry?.version ? [`v${skillEntry.version}`] : []),
      ...(brief?.written_at ? [brief.written_at] : []),
    ].slice(0, 5);
    return {
      kind,
      skill: {
        frontmatter: frontmatter.slice(0, 6),
        versionHistory,
        bodyPreview: (brief?.body ?? "").slice(0, 200),
      },
    };
  }

  const agentEntry = manifest.agents.find(
    (a) => a.id === repo.fullName.toLowerCase() || a.name.toLowerCase().includes(repo.name.toLowerCase()),
  );
  const capabilities = Array.from(
    new Set([
      ...(agentEntry?.tools ?? []).map((t) => t.name),
      ...(repo.tags ?? []).slice(0, 6),
    ]),
  ).slice(0, 8);
  const roleTopic =
    repo.topics.find((t) => t.toLowerCase().includes("agent")) ?? "autonomous workflow";
  return {
    kind,
    agent: {
      personaRole: `Specialized ${roleTopic} operator`,
      capabilities,
      exampleInvocations: capabilities.slice(0, 3).map((cap) => `Run ${cap} for ${repo.fullName}`),
    },
  };
}
