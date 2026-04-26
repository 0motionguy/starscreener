// /ideas/[id] — V2 standalone idea detail page.
//
// Exists so Share-to-X links have a real destination (without this page,
// /ideas/<id> is a 404 and the OG card never unfurls). Also lets
// deep-linking to an idea work from any external surface (email, Slack).
//
// pending_moderation and rejected ideas 404 so draft text can't be read
// via a known id before moderation runs.
//
// V2 design: TerminalBar header with idea metadata, mono back-link,
// .v2-card body containing the idea title + pitch + reactions panel.

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getIdeaById, toPublicIdea } from "@/lib/ideas";
import {
  countReactions,
  listReactionsForObject,
} from "@/lib/reactions";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
import { BracketMarkers } from "@/components/today-v2/primitives/BracketMarkers";
import {
  getIdeaCategory,
  getIdeaSignal,
  StatusDot,
} from "@/components/ideas/IdeaVisuals";
import { ObjectReactions } from "@/components/reactions/ObjectReactions";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { getRelativeTime } from "@/lib/utils";

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
  const idea = toPublicIdea(record);
  const signal = getIdeaSignal(idea, counts);
  const category = getIdeaCategory(idea);
  const publishedAt = idea.publishedAt ?? idea.createdAt;
  const totalReactions =
    (counts.build ?? 0) +
    (counts.use ?? 0) +
    (counts.buy ?? 0) +
    (counts.invest ?? 0);

  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <nav className="flex items-center mb-4">
            <Link
              href="/ideas"
              className="v2-mono inline-flex items-center gap-2"
              style={{
                color: "var(--v2-ink-300)",
                fontSize: 11,
                letterSpacing: "0.20em",
              }}
            >
              <span aria-hidden>←</span>
              <span aria-hidden>{"// "}</span>
              BACK TO IDEAS
            </Link>
          </nav>

          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>
                IDEA-{idea.id.slice(0, 6).toUpperCase()} · @{idea.authorHandle}
              </>
            }
            status={
              <span className="inline-flex items-center gap-2">
                <span style={{ color: "var(--v2-ink-300)" }}>{category}</span>
                <span style={{ color: "var(--v2-ink-500)" }}>·</span>
                <span
                  className="tabular-nums"
                  style={{ color: "var(--v2-ink-100)" }}
                >
                  SIG:{signal}
                </span>
              </span>
            }
          />
        </div>
      </section>

      <section>
        <div className="v2-frame py-6 max-w-[900px] mx-auto">
          <article className="v2-card v2-bracket relative p-6 md:p-8">
            <BracketMarkers />

            <h1
              className="v2-display"
              style={{
                fontSize: "clamp(28px, 4vw, 44px)",
                color: "var(--v2-ink-000)",
              }}
            >
              {idea.title}
            </h1>

            <p
              className="mt-4 text-[15px] leading-relaxed max-w-[70ch]"
              style={{ color: "var(--v2-ink-200)" }}
            >
              {idea.pitch}
            </p>

            <div className="mt-6 flex items-center gap-3 v2-mono flex-wrap">
              <StatusDot status={idea.buildStatus} />
              <span aria-hidden style={{ color: "var(--v2-line-300)" }}>
                ·
              </span>
              <span style={{ color: "var(--v2-ink-300)" }}>
                {getRelativeTime(publishedAt).toUpperCase()}
              </span>
              {totalReactions > 0 ? (
                <>
                  <span aria-hidden style={{ color: "var(--v2-line-300)" }}>
                    ·
                  </span>
                  <span
                    className="tabular-nums"
                    style={{ color: "var(--v2-ink-100)" }}
                  >
                    {totalReactions} REACTIONS
                  </span>
                </>
              ) : null}
            </div>

            <div
              className="mt-6 pt-6 border-t"
              style={{ borderColor: "var(--v2-line-100)" }}
            >
              <p
                className="v2-mono mb-3"
                style={{ color: "var(--v2-ink-300)" }}
              >
                <span aria-hidden>{"// "}</span>
                REACT · BUILD · USE · BUY · INVEST
              </p>
              <ObjectReactions
                objectType="idea"
                objectId={idea.id}
                initialCounts={counts}
              />
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
