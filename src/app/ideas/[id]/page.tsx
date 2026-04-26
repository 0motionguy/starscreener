// /ideas/[id] — standalone page for a single idea.
//
// Exists so Share-to-X links have a real destination (without this
// page, /ideas/<id> is a 404 and the OG card never unfurls). Also
// lets deep-linking to an idea work from any external surface
// (email, Slack, DMs).
//
// pending_moderation and rejected ideas 404 so draft text can't be
// read via a known id before moderation runs.

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getIdeaById, toPublicIdea } from "@/lib/ideas";
import {
  countReactions,
  listReactionsForObject,
} from "@/lib/reactions";
import { IdeaCard } from "@/components/ideas/IdeaCard";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!ID_PATTERN.test(id)) {
    return { title: `Idea not found — ${SITE_NAME}`, robots: { index: false } };
  }
  const record = await getIdeaById(id);
  if (
    !record ||
    (record.status !== "published" && record.status !== "shipped")
  ) {
    return { title: `Idea not found — ${SITE_NAME}`, robots: { index: false } };
  }
  const canonical = absoluteUrl(`/ideas/${id}`);
  // Build a clean social description — pitch is already size-bounded at
  // intake (20-280 chars), so passing it through as-is is safe.
  const description = `${record.pitch} — posted by @${record.authorHandle} on ${SITE_NAME}.`;
  return {
    title: `${record.title} — ${SITE_NAME}`,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: record.title,
      description,
      url: canonical,
      siteName: SITE_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title: record.title,
      description,
    },
  };
}

export default async function IdeaDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!ID_PATTERN.test(id)) notFound();
  const record = await getIdeaById(id);
  if (
    !record ||
    (record.status !== "published" && record.status !== "shipped")
  ) {
    notFound();
  }
  const reactions = await listReactionsForObject("idea", record.id);
  const counts = countReactions(reactions);

  return (
    <>
      <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        <nav className="flex items-center">
          <Link
            href="/ideas"
            className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to ideas
          </Link>
        </nav>
        <IdeaCard idea={toPublicIdea(record)} reactionCounts={counts} linkToDetail={false} />
      </div>
    </>
  );
}
