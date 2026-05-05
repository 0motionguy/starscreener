import { getDataStore, type DataStore } from "./data-store";

export interface ManifestTool {
  name: string;
  description?: string;
}

export interface SkillManifest {
  kind: "skill";
  id: string;
  name: string;
  version?: string;
  tools: ManifestTool[];
}

export interface AgentManifest {
  kind: "agent";
  id: string;
  name: string;
  version?: string;
  tools: ManifestTool[];
}

export interface McpManifest {
  kind: "mcp";
  id: string;
  endpoint?: string;
  tools: ManifestTool[];
}

export interface ManifestSnapshot {
  sampledAt?: string;
  source?: string;
  skills: SkillManifest[];
  agents: AgentManifest[];
  mcps: McpManifest[];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function parseTools(v: unknown): ManifestTool[] {
  if (!Array.isArray(v)) return [];
  const out: ManifestTool[] = [];
  for (const row of v) {
    const entry = asRecord(row);
    if (!entry) continue;
    const name = asString(entry.name);
    if (!name) continue;
    const description = asString(entry.description);
    out.push({ name, description });
  }
  return out;
}

function parseSkills(v: unknown): SkillManifest[] {
  if (!Array.isArray(v)) return [];
  const out: SkillManifest[] = [];
  for (const row of v) {
    const entry = asRecord(row);
    if (!entry) continue;
    const id = asString(entry.id);
    const name = asString(entry.name);
    if (!id || !name) continue;
    out.push({
      kind: "skill",
      id: id.toLowerCase(),
      name,
      version: asString(entry.version),
      tools: parseTools(entry.tools),
    });
  }
  return out;
}

function parseAgents(v: unknown): AgentManifest[] {
  if (!Array.isArray(v)) return [];
  const out: AgentManifest[] = [];
  for (const row of v) {
    const entry = asRecord(row);
    if (!entry) continue;
    const id = asString(entry.id);
    const name = asString(entry.name);
    if (!id || !name) continue;
    out.push({
      kind: "agent",
      id: id.toLowerCase(),
      name,
      version: asString(entry.version),
      tools: parseTools(entry.tools),
    });
  }
  return out;
}

function parseMcps(v: unknown): McpManifest[] {
  if (!Array.isArray(v)) return [];
  const out: McpManifest[] = [];
  for (const row of v) {
    const entry = asRecord(row);
    if (!entry) continue;
    const id = asString(entry.id);
    if (!id) continue;
    out.push({
      kind: "mcp",
      id: id.toLowerCase(),
      endpoint: asString(entry.endpoint),
      tools: parseTools(entry.tools),
    });
  }
  return out;
}

export function parseManifestSnapshot(raw: unknown): ManifestSnapshot {
  const root = asRecord(raw);
  if (!root) {
    return { skills: [], agents: [], mcps: [] };
  }

  // Backward-compat: existing mcp-manifest rows may be `{ tools: [...] }`.
  const legacyTools = parseTools(root.tools);
  const legacyMcpId = asString(root.id);

  const sampledAt = asString(root.sampledAt);
  const source = asString(root.source);
  const manifests = asRecord(root.manifests);

  const skills = parseSkills(manifests?.skills);
  const agents = parseAgents(manifests?.agents);
  const mcps = parseMcps(manifests?.mcps);

  if (mcps.length === 0 && legacyMcpId && legacyTools.length > 0) {
    mcps.push({
      kind: "mcp",
      id: legacyMcpId.toLowerCase(),
      tools: legacyTools,
    });
  }

  return { sampledAt, source, skills, agents, mcps };
}

export async function persistManifestSnapshot(
  key: string,
  raw: unknown,
  store: DataStore = getDataStore(),
): Promise<ManifestSnapshot> {
  const normalized = parseManifestSnapshot(raw);
  await store.write(key, {
    sampledAt: normalized.sampledAt ?? new Date().toISOString(),
    source: normalized.source ?? "unknown",
    manifests: {
      skills: normalized.skills,
      agents: normalized.agents,
      mcps: normalized.mcps,
    },
  });
  return normalized;
}
