import { z } from "zod";

const SkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string().optional(),
  body: z.string(),
});

const AgentSchema = z.object({
  role: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  body: z.string(),
});

const McpSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  tools: z.array(z.object({ name: z.string().min(1) })).default([]),
  resources: z
    .array(
      z.object({
        name: z.string().min(1).optional(),
        uri: z.string().min(1).optional(),
      }),
    )
    .default([]),
});

export type ParsedSkillManifest = z.infer<typeof SkillSchema>;
export type ParsedAgentManifest = z.infer<typeof AgentSchema>;
export type ParsedMcpManifest = z.infer<typeof McpSchema>;

function parseFrontmatter(markdown: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const m = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    return { frontmatter: {}, body: markdown };
  }
  const frontmatterRaw = m[1] ?? "";
  const body = m[2] ?? "";
  const frontmatter: Record<string, unknown> = {};
  const lines = frontmatterRaw.split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1).trim();
    if (!key) continue;
    if (raw.startsWith("[") && raw.endsWith("]")) {
      const list = raw
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      frontmatter[key] = list;
      continue;
    }
    frontmatter[key] = raw.replace(/^["']|["']$/g, "");
  }
  return { frontmatter, body };
}

export function parseSkill(text: string): ParsedSkillManifest {
  const { frontmatter, body } = parseFrontmatter(text);
  return SkillSchema.parse({
    name: frontmatter.name,
    description: frontmatter.description,
    version: frontmatter.version,
    body,
  });
}

export function parseAgent(text: string): ParsedAgentManifest {
  const { frontmatter, body } = parseFrontmatter(text);
  const capabilities =
    Array.isArray(frontmatter.capabilities) && frontmatter.capabilities.every((v) => typeof v === "string")
      ? (frontmatter.capabilities as string[])
      : [];
  const tools =
    Array.isArray(frontmatter.tools) && frontmatter.tools.every((v) => typeof v === "string")
      ? (frontmatter.tools as string[])
      : [];
  return AgentSchema.parse({
    role: frontmatter.role,
    capabilities,
    tools,
    body,
  });
}

export function parseMcp(jsonText: string): ParsedMcpManifest {
  const parsed = JSON.parse(jsonText) as unknown;
  return McpSchema.parse(parsed);
}
