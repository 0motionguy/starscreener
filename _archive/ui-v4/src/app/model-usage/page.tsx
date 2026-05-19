// /model-usage — admin-gated LLM usage dashboard.
//
// Server component. Refreshes the three aggregate blobs + model metadata
// via refreshModelUsageFromStore(), then renders a tabbed view backed by
// URL searchParam ?tab=. Charts are wrapped client islands; everything
// else is server-rendered.
//
// Auth: cookies()-based admin session check. Non-admin → notFound() so the
// route's existence isn't broadcast to anonymous traffic.

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { verifyAdminAuth } from "@/lib/api/auth";
import {
  getDailyByFeature,
  getDailyByModel,
  getDailySummary,
  getModelMetadata,
  refreshModelUsageFromStore,
} from "@/lib/model-usage";
import {
  applyPublicGate,
  buildOverview,
  rollUpFeatures,
  rollUpModels,
} from "@/lib/llm/derive";
import { UsageTabs, type UsageTabKey } from "./components/UsageTabs";
import { OverviewTab } from "./components/OverviewTab";
import { ModelsTab } from "./components/ModelsTab";
import { FeaturesTab } from "./components/FeaturesTab";
import { CostTab } from "./components/CostTab";
import { LatencyTab } from "./components/LatencyTab";
import { ReliabilityTab } from "./components/ReliabilityTab";
import { TrendsTab } from "./components/TrendsTab";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Model Usage — STARSCREENER",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ tab?: string; days?: string }>;
}

const TAB_ORDER: readonly UsageTabKey[] = [
  "overview",
  "models",
  "features",
  "cost",
  "latency",
  "reliability",
  "trends",
] as const;

function parseTab(raw: string | undefined): UsageTabKey {
  if (raw && (TAB_ORDER as readonly string[]).includes(raw)) return raw as UsageTabKey;
  return "overview";
}

export default async function ModelUsagePage({ searchParams }: PageProps) {
  // Build a NextRequest-shaped object from headers() — verifyAdminAuth only
  // touches cookies + authorization headers via NextRequest.headers.get,
  // and the Headers from next/headers exposes the same get() surface.
  const reqHeaders = await headers();
  const fakeRequest = {
    headers: {
      get: (k: string): string | null => reqHeaders.get(k),
    },
  } as unknown as Parameters<typeof verifyAdminAuth>[0];

  const verdict = verifyAdminAuth(fakeRequest);
  if (verdict.kind !== "ok") {
    notFound();
  }

  await refreshModelUsageFromStore();
  const sp = (await searchParams) ?? {};
  const tab = parseTab(sp.tab);
  const days = clampInt(sp.days, 1, 30, 1);

  const summary = getDailySummary();
  const byModel = getDailyByModel();
  const byFeature = getDailyByFeature();
  const metadataList = getModelMetadata();

  const modelRollup = applyPublicGate(rollUpModels(byModel, days), { internal: true });
  const featureRollup = rollUpFeatures(byFeature, days);
  const overview = buildOverview(summary, modelRollup, featureRollup);

  const lastSync = metadataList[0]?.last_synced_at ?? null;
  const cold = byModel.length === 0 && summary.length === 0;

  return (
    <main className="home-surface model-usage-page" style={pageStyle}>
      <section className="page-head">
        <div>
          <div className="crumb">
            <b>Model Usage</b> / internal · admin · v1
          </div>
          <h1>Which models actually power our work.</h1>
          <p className="lede">
            Real LLM traffic from STARSCREENER features. Anonymized at the
            edges — not a global market claim.
          </p>
        </div>
        <div className="clock">
          <span className="big">{lastSync ? formatClock(lastSync) : "—"}</span>
          <span className="live">models synced</span>
        </div>
      </section>

      <UsageTabs active={tab} days={days} />

      {cold ? (
        <ColdState />
      ) : tab === "overview" ? (
        <OverviewTab overview={overview} models={modelRollup} features={featureRollup} />
      ) : tab === "models" ? (
        <ModelsTab models={modelRollup} metaList={metadataList} />
      ) : tab === "features" ? (
        <FeaturesTab features={featureRollup} />
      ) : tab === "cost" ? (
        <CostTab summary={summary} byModel={byModel} />
      ) : tab === "latency" ? (
        <LatencyTab summary={summary} byModel={byModel} />
      ) : tab === "reliability" ? (
        <ReliabilityTab summary={summary} models={modelRollup} />
      ) : (
        <TrendsTab summary={summary} byModel={byModel} />
      )}
    </main>
  );
}

function ColdState() {
  return (
    <section style={{ padding: "32px 0", color: "var(--color-text-secondary)" }}>
      <p style={{ maxWidth: 640 }}>
        No telemetry yet. The aggregator hasn&apos;t produced a daily blob —
        either the worker hasn&apos;t emitted any LLM events since deploy or
        the cron hasn&apos;t fired. Check the worker logs and run{" "}
        <code>/api/cron/llm/aggregate</code> manually with the cron secret.
      </p>
    </section>
  );
}

const pageStyle = {
  display: "grid",
  gap: 24,
  paddingBottom: 64,
} as const;

function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function formatClock(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d
      .toISOString()
      .replace("T", " ")
      .replace(/:\d\d\.\d+Z$/, "Z");
  } catch {
    return "—";
  }
}
