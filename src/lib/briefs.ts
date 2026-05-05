import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { getDataStore } from "@/lib/data-store";

export interface RepoBriefFaqItem {
  q: string;
  a: string;
}

export interface RepoBrief {
  owner: string;
  name: string;
  hook: string;
  what: string;
  why_now: string;
  who_built_it: string;
  who_its_for: string;
  whats_different: string;
  sources: string[];
  written_at: string;
  body: string;
  faq?: RepoBriefFaqItem[];
}

export interface RepoBriefRef {
  owner: string;
  name: string;
  writtenAt: string;
  updatedAt: Date;
}

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;
export const REPO_BRIEF_TTL_SECONDS = 2_592_000;

interface ParsedFrontmatter {
  [key: string]: string | string[];
}

function isValidSlugPart(value: string): boolean {
  return SLUG_PART_PATTERN.test(value);
}

function isLikelyIsoTimestamp(value: string): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function briefPath(owner: string, name: string): string {
  return resolve(process.cwd(), "data", "briefs", `${owner}-${name}.md`);
}

function briefDir(): string {
  return resolve(process.cwd(), "data", "briefs");
}

function briefStoreKey(owner: string, name: string): string {
  return `brief:${owner}:${name}`;
}

function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    return { frontmatter: "", body: raw };
  }

  const normalized = raw.replace(/\r\n/g, "\n");
  const closeIndex = normalized.indexOf("\n---\n", 4);
  if (closeIndex === -1) {
    return { frontmatter: "", body: raw };
  }

  const frontmatter = normalized.slice(4, closeIndex);
  const body = normalized.slice(closeIndex + 5).trim();
  return { frontmatter, body };
}

function parseFrontmatter(frontmatter: string): ParsedFrontmatter {
  const lines = frontmatter.split("\n");
  const parsed: ParsedFrontmatter = {};

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.trimEnd() ?? "";
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("sources:")) {
      const sources: string[] = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        const item = lines[j]?.trim() ?? "";
        if (item.startsWith("- ")) {
          sources.push(item.slice(2).trim());
          i = j;
          continue;
        }
        break;
      }
      parsed.sources = sources;
      continue;
    }

    const idx = line.indexOf(":");
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
    parsed[key] = value;
  }

  return parsed;
}

function strField(parsed: ParsedFrontmatter, key: string): string {
  const value = parsed[key];
  return typeof value === "string" ? value : "";
}

function normalizeSources(sources: string[]): string[] {
  return Array.from(new Set(sources.map((source) => source.trim()).filter(Boolean)));
}

function isValidSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function parseMarkdownBrief(owner: string, name: string, raw: string): RepoBrief | null {
  const { frontmatter, body } = splitFrontmatter(raw);
  if (!frontmatter) return null;

  const parsed = parseFrontmatter(frontmatter);
  const sources = normalizeSources(
    Array.isArray(parsed.sources)
      ? parsed.sources.filter((source) => typeof source === "string" && source.trim().length > 0)
      : [],
  );

  const brief: RepoBrief = {
    owner,
    name,
    hook: strField(parsed, "hook"),
    what: strField(parsed, "what"),
    why_now: strField(parsed, "why_now"),
    who_built_it: strField(parsed, "who_built_it"),
    who_its_for: strField(parsed, "who_its_for"),
    whats_different: strField(parsed, "whats_different"),
    sources,
    written_at: strField(parsed, "written_at"),
    body,
  };

  return normalizeBrief(brief);
}

function normalizeBrief(input: RepoBrief | null): RepoBrief | null {
  if (!input) return null;
  if (!isValidSlugPart(input.owner) || !isValidSlugPart(input.name)) return null;

  const brief: RepoBrief = {
    ...input,
    hook: input.hook?.trim() ?? "",
    what: input.what?.trim() ?? "",
    why_now: input.why_now?.trim() ?? "",
    who_built_it: input.who_built_it?.trim() ?? "",
    who_its_for: input.who_its_for?.trim() ?? "",
    whats_different: input.whats_different?.trim() ?? "",
    body: input.body?.trim() ?? "",
    written_at: input.written_at?.trim() ?? "",
    sources: normalizeSources(input.sources ?? []),
  };

  if (!brief.hook || !brief.what || !brief.why_now || !brief.who_built_it || !brief.who_its_for || !brief.whats_different) {
    return null;
  }

  if (!brief.body) {
    brief.body = [brief.what, brief.why_now, brief.who_built_it, brief.who_its_for, brief.whats_different].join("\n\n");
  }

  if (!isLikelyIsoTimestamp(brief.written_at)) return null;
  if (brief.sources.length < 3 || !brief.sources.every(isValidSourceUrl)) return null;

  return brief;
}

function toMarkdown(brief: RepoBrief): string {
  const lines = [
    "---",
    `hook: ${brief.hook}`,
    `what: ${brief.what}`,
    `why_now: ${brief.why_now}`,
    `who_built_it: ${brief.who_built_it}`,
    `who_its_for: ${brief.who_its_for}`,
    `whats_different: ${brief.whats_different}`,
    "sources:",
    ...brief.sources.map((source) => `- ${source}`),
    `written_at: ${brief.written_at}`,
    "---",
    brief.body,
    "",
  ];
  return lines.join("\n");
}

function parseStoredBrief(data: unknown, owner: string, name: string): RepoBrief | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Partial<RepoBrief>;

  return normalizeBrief({
    owner,
    name,
    hook: typeof record.hook === "string" ? record.hook : "",
    what: typeof record.what === "string" ? record.what : "",
    why_now: typeof record.why_now === "string" ? record.why_now : "",
    who_built_it: typeof record.who_built_it === "string" ? record.who_built_it : "",
    who_its_for: typeof record.who_its_for === "string" ? record.who_its_for : "",
    whats_different: typeof record.whats_different === "string" ? record.whats_different : "",
    sources: Array.isArray(record.sources) ? record.sources.filter((v): v is string => typeof v === "string") : [],
    written_at: typeof record.written_at === "string" ? record.written_at : "",
    body: typeof record.body === "string" ? record.body : "",
    faq: Array.isArray(record.faq)
      ? record.faq.filter((entry): entry is RepoBriefFaqItem => Boolean(entry && typeof entry === "object" && typeof (entry as RepoBriefFaqItem).q === "string" && typeof (entry as RepoBriefFaqItem).a === "string"))
      : [],
  });
}

function parseRepoBriefFromFile(owner: string, name: string): RepoBrief | null {
  const filePath = briefPath(owner, name);
  if (!existsSync(filePath)) return null;

  const raw = readFileSync(filePath, "utf8");
  return parseMarkdownBrief(owner, name, raw);
}

export function getBriefFromFile(owner: string, name: string): RepoBrief | null {
  if (!isValidSlugPart(owner) || !isValidSlugPart(name)) return null;
  return parseRepoBriefFromFile(owner, name);
}

export async function getBrief(owner: string, name: string): Promise<RepoBrief | null> {
  if (!isValidSlugPart(owner) || !isValidSlugPart(name)) return null;

  const store = getDataStore();
  const result = await store.read<unknown>(briefStoreKey(owner, name));
  const fromStore = parseStoredBrief(result.data, owner, name);
  if (fromStore) return fromStore;

  return parseRepoBriefFromFile(owner, name);
}

export async function setBrief(owner: string, name: string, body: RepoBrief): Promise<void> {
  if (!isValidSlugPart(owner) || !isValidSlugPart(name)) {
    throw new Error("Invalid brief slug");
  }

  const normalized = normalizeBrief({ ...body, owner, name });
  if (!normalized) {
    throw new Error("Invalid brief payload");
  }

  const store = getDataStore();
  await store.write<RepoBrief>(briefStoreKey(owner, name), normalized, {
    ttlSeconds: REPO_BRIEF_TTL_SECONDS,
  });

  // Keep markdown artifact for local indexing and durability.
  writeFileSync(briefPath(owner, name), toMarkdown(normalized), "utf8");
}

export async function listRecentBriefs(limit = 7): Promise<RepoBriefRef[]> {
  const dir = briefDir();
  if (!existsSync(dir)) return [];

  const refs: RepoBriefRef[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === ".gitkeep") continue;

    const stem = entry.name.slice(0, -3);
    const sep = stem.indexOf("-");
    if (sep <= 0 || sep >= stem.length - 1) continue;

    const owner = stem.slice(0, sep);
    const name = stem.slice(sep + 1);
    if (!isValidSlugPart(owner) || !isValidSlugPart(name)) continue;

    const brief = await getBrief(owner, name);
    if (!brief) continue;

    const filePath = briefPath(owner, name);
    const stat = statSync(filePath);
    refs.push({
      owner,
      name,
      writtenAt: brief.written_at,
      updatedAt: stat.mtime,
    });
  }

  return refs
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, Math.max(1, Math.floor(limit)));
}

export function listRepoBriefRefs(): RepoBriefRef[] {
  const dir = briefDir();
  if (!existsSync(dir)) return [];

  const refs: RepoBriefRef[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === ".gitkeep") {
      continue;
    }

    const stem = entry.name.slice(0, -3);
    const sep = stem.indexOf("-");
    if (sep <= 0 || sep >= stem.length - 1) {
      continue;
    }

    const owner = stem.slice(0, sep);
    const name = stem.slice(sep + 1);
    if (!isValidSlugPart(owner) || !isValidSlugPart(name)) {
      continue;
    }

    const brief = parseRepoBriefFromFile(owner, name);
    if (!brief) {
      continue;
    }

    const filePath = briefPath(owner, name);
    const stat = statSync(filePath);
    refs.push({
      owner,
      name,
      writtenAt: brief.written_at,
      updatedAt: stat.mtime,
    });
  }

  return refs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

// Back-compat alias for in-flight branches.
export const getRepoBrief = getBrief;
