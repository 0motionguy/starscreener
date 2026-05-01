import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { UnknownMentionsAdmin } from "@/components/admin/UnknownMentionsAdmin";
import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSession,
} from "@/lib/api/admin-session";

export const metadata: Metadata = {
  title: "Admin — Unknown Mentions Discovery",
  description:
    "Top-N github repos seen across signal sources but not yet tracked. Promote candidates into the manual-repos queue.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export interface PromotedUnknownMention {
  fullName: string;
  totalCount: number;
  sourceCount: number;
  sources: string[];
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface PromotedUnknownMentionsFile {
  generatedAt: string | null;
  totalUnknownMentions: number;
  distinctRepos: number;
  minSources: number;
  topN: number;
  rows: PromotedUnknownMention[];
}

const EMPTY_FILE: PromotedUnknownMentionsFile = {
  generatedAt: null,
  totalUnknownMentions: 0,
  distinctRepos: 0,
  minSources: 1,
  topN: 200,
  rows: [],
};

async function loadPromoted(): Promise<PromotedUnknownMentionsFile> {
  const filePath = path.join(
    process.cwd(),
    "data",
    "unknown-mentions-promoted.json",
  );
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PromotedUnknownMentionsFile>;
    return {
      generatedAt:
        typeof parsed.generatedAt === "string" ? parsed.generatedAt : null,
      totalUnknownMentions: Number(parsed.totalUnknownMentions ?? 0),
      distinctRepos: Number(parsed.distinctRepos ?? 0),
      minSources: Number(parsed.minSources ?? 1),
      topN: Number(parsed.topN ?? 200),
      rows: Array.isArray(parsed.rows)
        ? (parsed.rows as PromotedUnknownMention[])
        : [],
    };
  } catch {
    return EMPTY_FILE;
  }
}

export default async function UnknownMentionsAdminPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (!verifyAdminSession(session)) {
    redirect("/admin/login?next=/admin/unknown-mentions");
  }
  const initialData = await loadPromoted();
  return <UnknownMentionsAdmin initialData={initialData} />;
}
