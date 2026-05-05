import { listIdeas } from "@/lib/ideas";
import { listReactions } from "@/lib/reactions";

export interface ProfileSitemapEntry {
  handle: string;
  lastmod: Date;
}

const HANDLE_RE = /^[A-Za-z0-9._-]{1,64}$/;

function toDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function listProfileSitemapEntries(
  limit: number = 1000,
): Promise<ProfileSitemapEntry[]> {
  const [ideas, reactions] = await Promise.all([listIdeas(), listReactions()]);
  const latestByHandle = new Map<string, number>();

  for (const idea of ideas) {
    const handle = (idea.authorHandle ?? "").trim();
    if (!HANDLE_RE.test(handle)) continue;
    const published = toDate(idea.publishedAt)?.getTime() ?? 0;
    const updated = toDate(idea.updatedAt)?.getTime() ?? 0;
    const created = toDate(idea.createdAt)?.getTime() ?? 0;
    const ts = Math.max(published, updated, created);
    if (ts <= 0) continue;
    const prev = latestByHandle.get(handle) ?? 0;
    if (ts > prev) latestByHandle.set(handle, ts);
  }

  for (const reaction of reactions) {
    const handle = (reaction.userId ?? "").trim();
    if (!HANDLE_RE.test(handle)) continue;
    const ts = toDate(reaction.createdAt)?.getTime() ?? 0;
    if (ts <= 0) continue;
    const prev = latestByHandle.get(handle) ?? 0;
    if (ts > prev) latestByHandle.set(handle, ts);
  }

  return Array.from(latestByHandle.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, limit))
    .map(([handle, ts]) => ({ handle, lastmod: new Date(ts) }));
}
