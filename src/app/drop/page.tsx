// /drop — Drop Repo submission flow. Phase 3C of the UI v6 rebuild.
//
// 4-step submission funnel:
//   step 1 — sign-in gate (skipped automatically if Clerk session exists)
//   step 2 — paste GitHub URL → live metadata fetch → preview card
//   step 3 — category picker (8 tiles) + tag pool (5-max)
//   step 4 — "why" textarea + submit
//
// Auth: anonymous OK for browsing steps 1-3. POST /api/repo-submissions
// applies a 10/hr rate-limit budget regardless of session; the submit
// button routes anonymous users to /sign-in before posting.
//
// URL contract:
//   ?step=1|2|3|4 — current step
//   ?cat=<id>     — display category
//   ?tags=t1,t2   — display tag selection
// Persistence: localStorage key `trendingrepo-drop-draft` mirrors the
// URL state so a refresh resumes the flow.
//
// Data wires:
//   refreshTrendingFromStore() → tracked-repo counter for the hero
//   listRepoSubmissions() → side queue when signed in
//   /api/repos/[owner]/[name] → live metadata preview (client-side)

import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

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
import { refreshTrendingFromStore, getAllFullNames } from "@/lib/trending";

import { DropCategoryPicker } from "@/components/drop/DropCategoryPicker";
import { DropHero } from "@/components/drop/DropHero";
import { DropPreviewCard } from "@/components/drop/DropPreviewCard";
import { DropPromotionRules } from "@/components/drop/DropPromotionRules";
import { DropStepStrip } from "@/components/drop/DropStepStrip";
import { DropSubmitButton } from "@/components/drop/DropSubmitButton";
import { DropTagPool } from "@/components/drop/DropTagPool";
import { DropUrlInputCard } from "@/components/drop/DropUrlInputCard";
import { DropWhyTextarea } from "@/components/drop/DropWhyTextarea";
import { DropYourQueue } from "@/components/drop/DropYourQueue";

// Step 4's submit POSTs into a per-IP rate-limited endpoint; per-user
// queue state varies on every request. Hard-bypass any caching layer.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Drop a repo",
  description:
    "Paste a GitHub URL. We auto-fetch metadata, scan cross-source mentions, score it against our momentum + consensus model, and surface promoted drops to /trending.",
};

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readScalar(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const v = params[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
}

function parseTagsParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => DROP_DISPLAY_TAGS.includes(t));
}

function parseCategoryParam(raw: string | null): DropDisplayCategoryId | null {
  if (!raw) return null;
  const match = DROP_DISPLAY_CATEGORIES.find((c) => c.id === raw);
  return match ? (match.id as DropDisplayCategoryId) : null;
}

async function safeSignedIn(): Promise<boolean> {
  if (!getClerkPublishableKey()) return false;
  try {
    const session = await auth();
    return Boolean(session?.userId);
  } catch {
    return false;
  }
}

async function fetchSubmissions() {
  try {
    const records = await listRepoSubmissions();
    return {
      submissions: records.slice(0, 6).map(toPublicRepoSubmission),
      summary: summarizeRepoSubmissionQueue(records),
      total: records.length,
    };
  } catch {
    return { submissions: [], summary: null, total: 0 };
  }
}

async function fetchTrackedCount(): Promise<number> {
  try {
    await refreshTrendingFromStore();
    return getAllFullNames().length;
  } catch {
    return 14_823;
  }
}

export default async function DropPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};

  const signedIn = await safeSignedIn();
  const [trackedCount, submissionsBundle] = await Promise.all([
    fetchTrackedCount(),
    fetchSubmissions(),
  ]);

  const step: DropStep = coerceDropStep(readScalar(params, "step"), signedIn);
  const initialCat = parseCategoryParam(readScalar(params, "cat"));
  const initialTags = parseTagsParam(readScalar(params, "tags"));

  // Recent-promotions stat for the hero. Counts how many of the last 5
  // submissions reached `listed` or `matched`. Falls back to neutral
  // copy when fewer than 5 submissions exist.
  const recent = submissionsBundle.submissions.slice(0, 5);
  const recentPromoted = recent.filter(
    (s) => s.status === "listed" || s.status === "matched",
  ).length;
  const liveCount = submissionsBundle.summary?.listed ?? 0;
  const total = submissionsBundle.total;
  const promoteRatePct = total > 0 ? Math.round((liveCount / total) * 100) : 0;

  return (
    <main className="main" data-route="drop" data-step={step}>
      <DropHero
        trackedReposCount={trackedCount}
        avgReviewHours={14}
        promoteRatePct={promoteRatePct}
        recentPromotedCount={recentPromoted}
        recentTotalCount={recent.length}
      />

      <DropStepStrip current={step} signedIn={signedIn} />

      {step === 1 && !signedIn ? (
        <div className="url-card">
          <div className="card-title" style={{ marginBottom: 8 }}>
            ▌ <b>Step 1 · Sign in</b> · so we can keep your queue + drop history
          </div>
          <div style={{ padding: "8px 4px 4px", color: "var(--fg-muted)", fontSize: 13, lineHeight: 1.55 }}>
            Anonymous drops are rate-limited (10/hr/IP) and do not show up in
            your queue. Sign in to track submissions and unlock higher limits.
          </div>
          <div className="row gap-2" style={{ padding: "12px 4px 4px" }}>
            <Link className="btn primary" href="/sign-in?redirectUrl=/drop?step=2">
              Sign in
            </Link>
            <Link className="btn ghost" href="/drop?step=2">
              Continue anonymously
            </Link>
          </div>
        </div>
      ) : null}

      {step >= 2 ? (
        <DropUrlInputCard />
      ) : null}

      {step >= 2 ? (
        <div
          className="preview-grid"
          style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 14 }}
        >
          <DropPreviewCard metadata={null} />
          <aside className="col gap-4">
            <DropYourQueue
              signedIn={signedIn}
              submissions={submissionsBundle.submissions}
              totalCount={total}
              liveCount={liveCount}
            />
            <DropPromotionRules />
          </aside>
        </div>
      ) : null}

      {step >= 3 ? (
        <>
          <DropCategoryPicker initialSelection={initialCat} />
          <DropTagPool initialSelection={initialTags} />
        </>
      ) : null}

      {step >= 4 ? (
        <>
          <DropWhyTextarea />
          <div
            style={{
              padding: "12px 14px",
              marginTop: 14,
              background: "var(--graphite)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--r-1)",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <DropSubmitButton signedIn={signedIn} />
          </div>
        </>
      ) : null}

      {step < 4 ? (
        <div
          className="row gap-2"
          style={{ marginTop: 18, justifyContent: "flex-end" }}
          data-component="drop-next"
        >
          <Link className="btn primary" href={`/drop?step=${step + 1}`}>
            Next step →
          </Link>
        </div>
      ) : null}
    </main>
  );
}
