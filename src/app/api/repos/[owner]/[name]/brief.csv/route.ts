// GET /api/repos/[owner]/[name]/brief.csv
//
// Operator brief — exports the intelligence layer for a repo as a CSV:
// verdicts, signal summary, why-it's-moving drivers, what-changed deltas,
// operator takes, health metrics, suggested alerts. Pulls from the same
// synthesizers that drive the UI so the export reads identically to the page.
//
// No auth required — the data is already public on the page. Cached at the
// edge for 5 minutes since the underlying spine refreshes on a similar cadence.

import { NextRequest, NextResponse } from "next/server";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import {
  refreshRepoCommunityProfileFromStore,
  getRepoCommunityProfile,
} from "@/lib/repo-community-profile";
import {
  refreshTrendingFromStore,
} from "@/lib/trending";
import {
  refreshGithubEventsIndexFromStore,
  getGithubEventsRepoByFullName,
  readGithubEventsForRepo,
  type NormalizedGithubEvent,
} from "@/lib/github-events";
import {
  computeVerdicts,
  synthesizeSignalSummary,
  synthesizeWhyMoving,
  computeWhatChanged,
  synthesizeOperatorTake,
  computeRepoHealth,
  suggestAlerts,
} from "@/lib/repo-intelligence";
import { errorEnvelope } from "@/lib/api/error-response";

export const runtime = "nodejs";

const SLUG_PATTERN = /^[A-Za-z0-9._-]+$/;

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvEscape).join(",") + "\n";
}

async function loadGithubEvents(
  fullName: string,
): Promise<NormalizedGithubEvent[]> {
  try {
    await refreshGithubEventsIndexFromStore();
    const entry = getGithubEventsRepoByFullName(fullName);
    if (!entry) return [];
    const result = await readGithubEventsForRepo(entry.repoId);
    return result.data?.events ?? [];
  } catch {
    return [];
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;

  if (!SLUG_PATTERN.test(owner) || !SLUG_PATTERN.test(name)) {
    return NextResponse.json(errorEnvelope("Invalid repo slug"), {
      status: 400,
    });
  }

  const fullName = `${owner}/${name}`;

  await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    refreshRepoCommunityProfileFromStore(fullName).catch(() => undefined),
  ]);

  const repo = (() => {
    try {
      return getDerivedRepoByFullName(fullName);
    } catch {
      return null;
    }
  })();

  if (!repo) {
    return NextResponse.json(errorEnvelope("Repo not found"), { status: 404 });
  }

  const community = getRepoCommunityProfile(fullName);
  const events = await loadGithubEvents(fullName);

  const verdicts = computeVerdicts({ repo, community, events });
  const summary = synthesizeSignalSummary({ repo, community, verdicts });
  const drivers = synthesizeWhyMoving({ repo, community, events });
  const changed = computeWhatChanged({ repo, community, events });
  const takes = synthesizeOperatorTake({ repo, community, verdicts });
  const health = computeRepoHealth({ repo, community, events, verdicts });
  const alerts = suggestAlerts({ repo, community, verdicts });

  let csv = "";

  csv += csvRow(["TrendingRepo Operator Brief", repo.fullName]);
  csv += csvRow(["Generated at", new Date().toISOString()]);
  csv += csvRow(["URL", `https://trendingrepo.com/repo/${owner}/${name}`]);
  csv += "\n";

  csv += csvRow(["Section", "Field", "Value"]);

  csv += csvRow(["Identity", "Owner", repo.owner]);
  csv += csvRow(["Identity", "Name", repo.name]);
  csv += csvRow(["Identity", "Language", repo.language ?? ""]);
  csv += csvRow(["Identity", "Description", repo.description ?? ""]);
  csv += csvRow(["Identity", "Stars", repo.stars ?? 0]);
  csv += csvRow(["Identity", "Forks", repo.forks ?? 0]);
  csv += csvRow(["Identity", "Contributors", repo.contributors ?? 0]);
  csv += csvRow(["Identity", "Created", repo.createdAt ?? ""]);
  csv += csvRow(["Identity", "Last commit", repo.lastCommitAt ?? ""]);

  csv += csvRow([
    "Verdict",
    "Trend strength",
    `${verdicts.trendStrength.value} — ${verdicts.trendStrength.reason}`,
  ]);
  csv += csvRow([
    "Verdict",
    "Repo health",
    `${verdicts.repoHealth.value} — ${verdicts.repoHealth.reason}`,
  ]);
  csv += csvRow([
    "Verdict",
    "Founder relevance",
    `${verdicts.founderRelevance.value} — ${verdicts.founderRelevance.reason}`,
  ]);
  csv += csvRow([
    "Verdict",
    "Production readiness",
    `${verdicts.productionReadiness.value} — ${verdicts.productionReadiness.reason}`,
  ]);
  csv += csvRow([
    "Verdict",
    "Signal confidence",
    `${verdicts.signalConfidence.value} — ${verdicts.signalConfidence.reason}`,
  ]);

  csv += csvRow(["Summary", "What it is", summary.whatItIs]);
  csv += csvRow(["Summary", "Why it matters", summary.whyItMatters]);
  csv += csvRow(["Summary", "Why it's moving", summary.whyMovingNow]);
  csv += csvRow(["Summary", "Who should care", summary.whoShouldCare]);

  drivers.forEach((d, i) => {
    csv += csvRow([`Driver #${i + 1}`, d.emphasis, d.text]);
  });

  changed.bucket24h.forEach((r) => {
    csv += csvRow(["What changed · 24h", r.label, r.value]);
  });
  changed.bucket7d.forEach((r) => {
    csv += csvRow(["What changed · 7d", r.label, r.value]);
  });
  changed.bucket30d.forEach((r) => {
    csv += csvRow(["What changed · 30d", r.label, r.value]);
  });

  takes.forEach((t) => {
    csv += csvRow(["Operator take", `${t.audience} (${t.stance})`, t.one_liner]);
  });

  csv += csvRow(["Health", "Verdict", health.verdict.value]);
  csv += csvRow(["Health", "Production line", health.productionLine]);
  health.metrics.forEach((m) => {
    csv += csvRow([
      `Health metric`,
      m.label,
      `${m.value}${m.detail ? ` — ${m.detail}` : ""}`,
    ]);
  });

  alerts.forEach((a) => {
    csv += csvRow([
      `Alert${a.recommended ? " (recommended)" : ""}`,
      a.label,
      a.rationale,
    ]);
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${owner}-${name}-brief.csv"`,
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
    },
  });
}
