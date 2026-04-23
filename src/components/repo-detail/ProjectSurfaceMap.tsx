import type { JSX } from "react";
import {
  BookOpen,
  Boxes,
  ExternalLink,
  FileText,
  Globe2,
  Rocket,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Repo } from "@/lib/types";
import type { NpmPackageRow } from "@/lib/npm";
import type { Launch } from "@/lib/producthunt";
import type { AisoToolsDimension, AisoToolsScan } from "@/lib/aiso-tools";
import { getRepoMetadata } from "@/lib/repo-metadata";
import { getRepoProfile } from "@/lib/repo-profiles";
import { fetchGithubRepoHomepageUrl } from "@/lib/github-repo-homepage";
import { formatNumber, getRelativeTime } from "@/lib/utils";

interface ProjectSurfaceMapProps {
  repo: Repo;
  npmPackages: NpmPackageRow[];
  productHuntLaunch: Launch | null;
}

interface Surface {
  label: string;
  value: string;
  href?: string;
  icon: LucideIcon;
  active: boolean;
  detail: string;
}

function isGithubUrl(url: string | null | undefined): boolean {
  return Boolean(url && /github\.com/i.test(url));
}

function cleanUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function statusTone(status: "pass" | "warn" | "fail"): string {
  if (status === "pass") return "text-up";
  if (status === "warn") return "text-warning";
  return "text-down";
}

function formatDetailValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number" && Number.isFinite(value)) return formatNumber(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `${value.length}`;
  if (value && typeof value === "object") return "set";
  return "-";
}

function getDimension(
  dimensions: AisoToolsDimension[],
  ...keys: string[]
): AisoToolsDimension | null {
  return dimensions.find((dimension) => keys.includes(dimension.key)) ?? null;
}

function pctOfWeight(dimension: AisoToolsDimension): number {
  if (dimension.weight <= 0) return Math.min(100, Math.max(0, dimension.score));
  return Math.round((dimension.score / dimension.weight) * 100);
}

function agentSignals(agent: AisoToolsDimension | null): Array<{
  label: string;
  value: string;
  active: boolean;
}> {
  const detected =
    agent?.details.detected &&
    typeof agent.details.detected === "object" &&
    !Array.isArray(agent.details.detected)
      ? (agent.details.detected as Record<string, unknown>)
      : {};
  return [
    ["API", detected.api],
    ["MCP", detected.mcp],
    ["CLI", detected.cli],
    ["WebMCP", detected.webmcp],
    ["Discovery", detected.agent_discovery],
    ["Safety docs", detected.integration_safety],
  ].map(([label, value]) => ({
    label: String(label),
    value: value === true ? "yes" : "no",
    active: value === true,
  }));
}

function engineStats(promptTests: AisoToolsScan["promptTests"]) {
  const engines = ["ChatGPT", "Claude", "Perplexity", "Gemini"];
  return engines.map((engine) => {
    const rows = promptTests.filter((test) =>
      test.engine.toLowerCase().includes(engine.toLowerCase()),
    );
    const cited = rows.filter((test) => test.cited).length;
    const mentioned = rows.filter((test) => test.brandMentioned).length;
    const bestPosition =
      rows.length > 0 ? Math.max(...rows.map((test) => test.position ?? 0)) : 0;
    return { engine, total: rows.length, cited, mentioned, bestPosition };
  });
}

export async function ProjectSurfaceMap({
  repo,
  npmPackages,
  productHuntLaunch,
}: ProjectSurfaceMapProps): Promise<JSX.Element> {
  const profile = getRepoProfile(repo.fullName);
  const metadata = getRepoMetadata(repo.fullName);
  const npmHomepages = npmPackages
    .map((pkg) => cleanUrl(pkg.homepage))
    .filter((url): url is string => Boolean(url));
  const docsUrl =
    npmHomepages.find((url) => /docs|readme|documentation/i.test(url)) ?? null;
  const discoveredWebsiteUrl =
    cleanUrl(productHuntLaunch?.website) ??
    cleanUrl(metadata?.homepageUrl) ??
    npmHomepages.find((url) => !isGithubUrl(url)) ??
    null;
  const githubHomepageUrl = profile?.websiteUrl || discoveredWebsiteUrl
    ? null
    : await fetchGithubRepoHomepageUrl(repo.fullName);
  const websiteUrl = profile?.websiteUrl ?? discoveredWebsiteUrl ?? githubHomepageUrl;
  const topPackage = npmPackages
    .slice()
    .sort((a, b) => b.downloads7d - a.downloads7d)[0];
  const aisoScan = profile?.aisoScan ?? null;
  const agentDimension = aisoScan
    ? getDimension(aisoScan.dimensions, "agent_readiness")
    : null;
  const crawlerDimension = aisoScan
    ? getDimension(aisoScan.dimensions, "crawler", "ai_discovery")
    : null;
  const schemaDimension = aisoScan
    ? getDimension(aisoScan.dimensions, "schema", "structured_data")
    : null;
  const llmsDimension = aisoScan
    ? getDimension(aisoScan.dimensions, "llmstxt", "ai_discovery")
    : null;
  const engines = aisoScan ? engineStats(aisoScan.promptTests) : [];

  const surfaces: Surface[] = [
    {
      label: "GitHub",
      value: repo.fullName,
      href: repo.url || `https://github.com/${repo.fullName}`,
      icon: Boxes,
      active: true,
      detail: `${formatNumber(repo.stars)} stars`,
    },
    {
      label: "Website",
      value: websiteUrl ? hostname(websiteUrl) : "not linked",
      href: websiteUrl ?? undefined,
      icon: Globe2,
      active: websiteUrl != null,
      detail: websiteUrl
        ? aisoScan?.score != null
          ? `AISO scan ${aisoScan.score}/100`
          : profile?.status === "scan_failed"
            ? "AISO scan failed"
            : profile?.status === "rate_limited"
              ? "AISO rate limited; queued"
              : "site found; profile scan queued"
        : "homepage not tracked yet",
    },
    {
      label: "Docs",
      value: docsUrl ? hostname(docsUrl) : "pending",
      href: docsUrl ?? undefined,
      icon: BookOpen,
      active: docsUrl != null,
      detail: docsUrl ? "docs surface detected" : "docs scanner pending",
    },
    {
      label: "npm",
      value: topPackage ? topPackage.name : "none",
      href: topPackage?.npmUrl,
      icon: Boxes,
      active: topPackage != null,
      detail: topPackage
        ? `${formatNumber(topPackage.downloads7d)} downloads / 7d`
        : "no linked npm package",
    },
    {
      label: "ProductHunt",
      value: productHuntLaunch ? productHuntLaunch.name : "none",
      href: productHuntLaunch?.url,
      icon: Rocket,
      active: productHuntLaunch != null,
      detail: productHuntLaunch
        ? `${formatNumber(productHuntLaunch.votesCount)} votes`
        : "no launch linked",
    },
    {
      label: "Paper/model",
      value: "pending",
      icon: FileText,
      active: false,
      detail: "HF/arXiv resolver not attached yet",
    },
  ];

  return (
    <section className="rounded-card border border-border-primary bg-bg-card p-4 shadow-card">
      <header className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-secondary">
            Project surface map
            <span className="ml-2 text-text-tertiary">{"// entity links"}</span>
          </h2>
          <p className="mt-1 text-sm text-text-tertiary">
            Known repo, package, launch, and site surfaces.
          </p>
        </div>
        <span className="rounded-md border border-border-primary bg-bg-secondary px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          {aisoScan
            ? "profile scan"
            : profile?.status === "scan_pending" || profile?.status === "scan_running"
              ? "scan queued"
              : "surfaces only"}
        </span>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {surfaces.map((surface) => {
          const Icon = surface.icon;
          const content = (
            <>
              <span
                className={
                  surface.active
                    ? "flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand"
                    : "flex size-7 shrink-0 items-center justify-center rounded-md bg-bg-secondary text-text-tertiary"
                }
              >
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                  {surface.label}
                </span>
                <span
                  className={
                    surface.active
                      ? "block truncate text-sm text-text-primary"
                      : "block truncate text-sm text-text-tertiary"
                  }
                >
                  {surface.value}
                </span>
                <span className="block truncate text-[11px] text-text-tertiary">
                  {surface.detail}
                </span>
              </span>
              {surface.href && (
                <ExternalLink className="size-3 text-text-tertiary" aria-hidden />
              )}
            </>
          );

          return surface.href ? (
            <a
              key={surface.label}
              href={surface.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-md border border-border-primary bg-bg-secondary/60 p-2.5 transition-colors hover:bg-bg-card-hover"
            >
              {content}
            </a>
          ) : (
            <div
              key={surface.label}
              className="flex items-center gap-2.5 rounded-md border border-border-primary bg-bg-secondary/40 p-2.5 opacity-80"
            >
              {content}
            </div>
          );
        })}
      </div>

          {aisoScan && (
        <div className="mt-4 rounded-md border border-border-primary bg-bg-secondary/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <a
              href={aisoScan.resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-text-secondary hover:text-brand transition-colors"
            >
              <Search className="size-3.5 text-brand" aria-hidden />
              AISO real website scan
              <ExternalLink className="size-3" aria-hidden />
            </a>
            <span className="font-mono text-sm font-semibold text-text-primary tabular-nums">
              {aisoScan.score != null ? `${aisoScan.score}/100` : aisoScan.status}
            </span>
          </div>

          {aisoScan.score != null && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-primary">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${aisoScan.score}%` }}
              />
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {aisoScan.dimensions.slice(0, 9).map((dimension) => (
              <div
                key={dimension.key}
                className="rounded-md border border-border-primary bg-bg-primary/40 px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-text-secondary">
                    {dimension.label}
                  </span>
                  <span
                    className={`font-mono text-[11px] tabular-nums ${statusTone(dimension.status)}`}
                  >
                    {dimension.weight > 0
                      ? `${dimension.score}/${dimension.weight}`
                      : dimension.score}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg-secondary">
                  <div
                    className={
                      dimension.status === "pass"
                        ? "h-full rounded-full bg-up"
                        : dimension.status === "warn"
                          ? "h-full rounded-full bg-warning"
                          : "h-full rounded-full bg-down"
                    }
                    style={{ width: `${pctOfWeight(dimension)}%` }}
                  />
                </div>
                {dimension.issuesCount > 0 && (
                  <p className="mt-1 text-[10px] text-text-tertiary">
                    {dimension.issuesCount} issue{dimension.issuesCount === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-md border border-border-primary bg-bg-primary/40 p-2.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
              Technical signal board
            </p>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
              <TechSignal
                label="Reachable"
                dimension={crawlerDimension}
                detailKey="gptbot_homepage_blocked"
                invert
              />
              <TechSignal
                label="JSON-LD"
                dimension={schemaDimension}
                detailKey="nodes_parsed"
              />
              <TechSignal
                label="Meta tags"
                dimension={schemaDimension}
                detailKey="meta_tags"
              />
              <TechSignal
                label="AI discovery"
                dimension={llmsDimension}
                detailKey="llms_txt_present"
              />
              <TechSignal
                label="Agent access"
                dimension={agentDimension}
                detailKey="detected"
              />
            </div>
          </div>

          {agentDimension && (
            <div className="mt-3 rounded-md border border-border-primary bg-bg-primary/40 p-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                  Agent readiness
                </p>
                <span
                  className={`font-mono text-[11px] tabular-nums ${statusTone(agentDimension.status)}`}
                >
                  {agentDimension.score}/{agentDimension.weight}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {agentSignals(agentDimension).map((signal) => (
                  <span
                    key={signal.label}
                    className={
                      signal.active
                        ? "rounded-md border border-up/30 bg-up/10 px-2 py-1 font-mono text-[10px] text-up"
                        : "rounded-md border border-border-primary bg-bg-secondary px-2 py-1 font-mono text-[10px] text-text-tertiary"
                    }
                  >
                    {signal.label}: {signal.value}
                  </span>
                ))}
              </div>
            </div>
          )}

          {engines.some((engine) => engine.total > 0) && (
            <div className="mt-3 rounded-md border border-border-primary bg-bg-primary/40 p-2.5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                AI citation engines
              </p>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {engines.map((engine) => (
                  <div
                    key={engine.engine}
                    className="rounded-md border border-border-primary bg-bg-secondary/70 px-2 py-2"
                  >
                    <p className="truncate text-[11px] text-text-secondary">
                      {engine.engine}
                    </p>
                    <p
                      className={
                        engine.cited > 0
                          ? "mt-1 font-mono text-sm text-up tabular-nums"
                          : "mt-1 font-mono text-sm text-text-tertiary tabular-nums"
                      }
                    >
                      {engine.cited}/{engine.total || 0} cited
                    </p>
                    <p className="mt-0.5 text-[10px] text-text-tertiary">
                      {engine.mentioned} mentions | pos {engine.bestPosition || "-"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {aisoScan.issues.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {aisoScan.issues.slice(0, 3).map((issue) => (
                <li
                  key={`${issue.severity}-${issue.title}`}
                  className="text-[11px] leading-snug text-text-tertiary"
                >
                  <span className="font-mono uppercase text-warning">
                    {issue.severity}
                  </span>{" "}
                  <span className="text-text-secondary">{issue.title}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-[10px] text-text-tertiary">
            {aisoScan.completedAt
              ? `scanned ${getRelativeTime(aisoScan.completedAt)}`
              : `scan status: ${aisoScan.status}`}
          </p>
        </div>
      )}
    </section>
  );
}

function TechSignal({
  label,
  dimension,
  detailKey,
  invert = false,
}: {
  label: string;
  dimension: AisoToolsDimension | null;
  detailKey: string;
  invert?: boolean;
}) {
  const raw = dimension?.details?.[detailKey];
  const positive =
    typeof raw === "boolean"
      ? invert
        ? !raw
        : raw
      : typeof raw === "number"
        ? raw > 0
        : Boolean(raw);
  return (
    <div className="rounded-md border border-border-primary bg-bg-secondary/70 px-2 py-2">
      <p className="truncate text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </p>
      <p
        className={
          positive
            ? "mt-1 font-mono text-xs text-up"
            : "mt-1 font-mono text-xs text-warning"
        }
      >
        {formatDetailValue(raw)}
      </p>
    </div>
  );
}

export default ProjectSurfaceMap;
