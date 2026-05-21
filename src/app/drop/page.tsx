import { auth } from "@clerk/nextjs/server";

import { DropCategoryPicker } from "@/components/drop/DropCategoryPicker";
import { DropHero } from "@/components/drop/DropHero";
import { DropLivePreviewSection } from "@/components/drop/DropLivePreviewSection";
import type { DropPreviewMetadata } from "@/components/drop/DropPreviewCard";
import { DropPromotionRules } from "@/components/drop/DropPromotionRules";
import { DropStepStrip } from "@/components/drop/DropStepStrip";
import { DropSubmitButton } from "@/components/drop/DropSubmitButton";
import { DropTagPool } from "@/components/drop/DropTagPool";
import { DropWhyTextarea } from "@/components/drop/DropWhyTextarea";
import { DropYourQueue } from "@/components/drop/DropYourQueue";
import { getClerkPublishableKey } from "@/lib/auth/clerk-config";
import {
  coerceDropStep,
  DROP_DISPLAY_CATEGORIES,
  DROP_DISPLAY_TAGS,
  type DropDisplayCategoryId,
  type DropStep,
} from "@/lib/drop/steps";
import {
  listRepoSubmissions,
  summarizeRepoSubmissionQueue,
  toPublicRepoSubmission,
} from "@/lib/repo-submissions";
import { getAllFullNames, refreshTrendingFromStore } from "@/lib/trending";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Drop a repo - TrendingRepo",
  description:
    "Submit an open-source GitHub repo for review with fetched metadata and cross-source coverage.",
};

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const SEEDED_PREVIEW: DropPreviewMetadata = {
  owner: "openai",
  name: "codex",
  description:
    "Open-source coding agent for terminal workflows. The drop preview uses live GitHub metadata and source coverage only; ranking happens after review.",
  language: "TypeScript",
  license: "Apache-2.0",
  stars: 42800,
  starDelta30d: 1840,
  forks: 5200,
  forkDelta30d: 318,
  contributors: 182,
  activeContributors: 34,
  trackedCount: 14823,
  mentions: [
    { platform: "hackernews", label: "1 launch thread" },
    { platform: "reddit", label: "2 operator posts" },
    { platform: "devto", label: "1 build note" },
    { platform: "github", label: "release activity" },
  ],
};

const SEEDED_WHY =
  "Open-source coding-agent workflow with active releases, visible operator adoption, and enough cross-source discussion to justify a human review. The submission should enter the intake queue with GitHub metadata, source marks, and a short review note attached.";

function readScalar(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseCategoryParam(raw: string | undefined): DropDisplayCategoryId | null {
  if (!raw) return null;
  return DROP_DISPLAY_CATEGORIES.some((cat) => cat.id === raw)
    ? (raw as DropDisplayCategoryId)
    : null;
}

function parseTagsParam(raw: string | undefined): string[] {
  if (!raw) return [];
  const allowed = new Set(DROP_DISPLAY_TAGS);
  const out: string[] = [];
  for (const tag of raw.split(",")) {
    const cleaned = tag.trim().toUpperCase();
    if (allowed.has(cleaned) && !out.includes(cleaned)) out.push(cleaned);
  }
  return out.slice(0, 5);
}

async function fetchSubmissions() {
  try {
    const submissions = await listRepoSubmissions();
    const publicRows = submissions.slice(0, 25).map(toPublicRepoSubmission);
    return {
      submissions: publicRows,
      summary: summarizeRepoSubmissionQueue(submissions),
      total: submissions.length,
    };
  } catch {
    return { submissions: [], summary: null, total: 0 };
  }
}

async function fetchTrackedCount(): Promise<number> {
  try {
    await refreshTrendingFromStore();
    const all = getAllFullNames();
    if (all.length > 0) return all.length;
  } catch {
    // Keep the route renderable if the local data store is unavailable.
  }

  try {
    const all = getAllFullNames();
    return all.length;
  } catch {
    return SEEDED_PREVIEW.trackedCount ?? 14823;
  }
}

async function getSignedIn(): Promise<boolean> {
  if (!getClerkPublishableKey()) return false;
  try {
    const session = await auth();
    return Boolean(session.userId);
  } catch {
    return false;
  }
}

export default async function DropPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const [signedIn, trackedCount, submissionsBundle] = await Promise.all([
    getSignedIn(),
    fetchTrackedCount(),
    fetchSubmissions(),
  ]);

  const requestedStep = readScalar(params, "step");
  const step: DropStep = requestedStep
    ? coerceDropStep(requestedStep, signedIn)
    : 2;
  const initialCat =
    parseCategoryParam(readScalar(params, "cat")) ?? "dev-tool";
  const parsedTags = parseTagsParam(readScalar(params, "tags"));
  const initialTags =
    parsedTags.length > 0 ? parsedTags : ["CLI", "AI", "DEV-TOOL"];

  const recent = submissionsBundle.submissions.slice(0, 5);
  const recentListed = recent.filter(
    (s) => s.status === "listed" || s.status === "matched",
  ).length;
  const liveCount = submissionsBundle.summary?.listed ?? 0;
  const total = submissionsBundle.total;
  const listedRatePct = total > 0 ? Math.round((liveCount / total) * 100) : 0;
  const recentListedCount = recent.length > 0 ? recentListed : 0;
  const recentTotalCount = recent.length > 0 ? recent.length : 5;
  const previewMetadata: DropPreviewMetadata = {
    ...SEEDED_PREVIEW,
    trackedCount,
    fetchedAt: new Date(Date.now() - 13 * 60_000).toISOString(),
  };

  return (
    <main className={`main ${styles.dropScope}`} data-route="drop" data-step={step}>
      <DropHero
        trackedReposCount={trackedCount}
        avgReviewHours={14}
        listedRatePct={listedRatePct}
        recentListedCount={recentListedCount}
        recentTotalCount={recentTotalCount}
      />

      <DropStepStrip current={step} signedIn={signedIn} />

      <DropLivePreviewSection
        initialMetadata={previewMetadata}
        initialCategory={initialCat}
        initialTags={initialTags}
        initialWhy={SEEDED_WHY}
        sidePanel={
          <aside className="col gap-4">
            <DropYourQueue
              signedIn={signedIn}
              submissions={submissionsBundle.submissions}
              totalCount={total}
              liveCount={liveCount}
            />
            <DropPromotionRules />
          </aside>
        }
      />

      <DropCategoryPicker initialSelection={initialCat} />
      <DropTagPool initialSelection={initialTags} />
      <DropWhyTextarea initialValue={SEEDED_WHY} />

      <div className="drop-submit-footer">
        <div className="drop-submit-status">
          <span className="up-text">* DRAFT</span>
          <span>FORM {step} of 4 - auto-saved</span>
          <span>PRE-SCAN {previewMetadata.stars?.toLocaleString() ?? "-"} stars - {previewMetadata.mentions?.length ?? 0} source marks</span>
          <span>INTAKE READY - review queue metadata attached</span>
        </div>
        <DropSubmitButton signedIn={signedIn} />
      </div>
    </main>
  );
}
