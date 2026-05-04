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
import { getRepoProfile, type RepoProfileStatus } from "@/lib/repo-profiles";
import { fetchGithubRepoHomepageUrl } from "@/lib/github-repo-homepage";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import { AisoRetryButton } from "./AisoRetryButton";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoDisplayLogoUrl, resolveLogoUrl } from "@/lib/logos";

type AisoUiStatus =
  | "scanned"
  | "queued"
  | "rate_limited"
  | "failed"
  | "none";

function deriveAisoUiStatus(
  scan: AisoToolsScan | null,
  profileStatus: RepoProfileStatus | undefined,
): AisoUiStatus {
  if (scan?.status === "completed") return "scanned";
  if (profileStatus === "rate_limited") return "rate_limited";
  if (profileStatus === "scan_failed") return "failed";
  if (scan?.status === "failed") return "failed";
  if (profileStatus === "scan_pending" || profileStatus === "scan_running")
    return "queued";
  if (scan?.status === "queued" || scan?.status === "running") return "queued";
  return "none";
}

function aisoStatusTone(status: AisoUiStatus): string {
  if (status === "scanned") return "text-[var(--v4-money)]";
  if (status === "rate_limited" || status === "queued") return "text-[var(--v4-amber)]";
  if (status === "failed") return "text-[var(--v4-red)]";
  return "text-text-tertiary";
}

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
  logoUrl?: string | null;
  logoName?: string;
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
  if (status === "pass") return "text-[var(--v4-money)]";
  if (status === "warn") return "text-[var(--v4-amber)]";
  return "text-[var(--v4-red)]";
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
  const aisoUiStatus = deriveAisoUiStatus(aisoScan, profile?.status);
  const aisoHighScore =
    aisoScan && aisoScan.score != null && aisoScan.score > 70;
  const aisoTopDimensions = aisoScan
    ? [...aisoScan.dimensions]
        .sort((a, b) => pctOfWeight(b) - pctOfWeight(a))
        .slice(0, 3)
    : [];
  const [aisoOwner, aisoName] = repo.fullName.split("/");
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
      logoUrl: repoDisplayLogoUrl(repo.fullName, repo.ownerAvatarUrl, 28),
      logoName: repo.fullName,
      active: true,
      detail: `${formatNumber(repo.stars)} stars`,
    },
    {
      label: "Website",
      value: websiteUrl ? hostname(websiteUrl) : "not linked",
      href: websiteUrl ?? undefined,
      icon: Globe2,
      logoUrl: resolveLogoUrl(websiteUrl, repo.fullName, 32),
      logoName: websiteUrl ? hostname(websiteUrl) : repo.fullName,
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
      logoUrl: resolveLogoUrl(docsUrl, repo.fullName, 32),
      logoName: docsUrl ? hostname(docsUrl) : "docs",
      active: docsUrl != null,
      detail: docsUrl ? "docs surface detected" : "docs scanner pending",
    },
    {
      label: "npm",
      value: topPackage ? topPackage.name : "none",
      href: topPackage?.npmUrl,
      icon: Boxes,
      logoUrl: repoDisplayLogoUrl(repo.fullName, repo.ownerAvatarUrl, 32),
      logoName: topPackage?.name ?? repo.fullName,
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
      logoUrl: resolveLogoUrl(productHuntLaunch?.website, productHuntLaunch?.name, 32),
      logoName: productHuntLaunch?.name ?? "ProductHunt",
      active: productHuntLaunch != null,
      detail: productHuntLaunch
        ? `${formatNumber(productHuntLaunch.votesCount)} votes`
        : "no launch linked",
    },
    {
      label: "Paper/model",
      value: "pending",
      icon: FileText,
      logoUrl: null,
      logoName: "Paper/model",
      active: false,
      detail: "HF/arXiv resolver not attached yet",
    },
  ];

  return (
    <section className="v2-card overflow-hidden">
      <div className="v2-term-bar">
        <span aria-hidden className="flex items-center gap-1.5">
          <span className="block h-1.5 w-1.5 rounded-full v2-live-dot" />
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--v2-line-200)" }}
          />
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--v2-line-200)" }}
          />
        </span>
        <span
          className="flex-1 truncate"
          style={{ color: "var(--v2-ink-200)" }}
        >
          {"// PROJECT SURFACE MAP · ENTITY LINKS"}
        </span>
        <span
          className="v2-stat shrink-0"
          style={{ color: "var(--v2-ink-300)" }}
        >
          {aisoScan
            ? "PROFILE SCAN"
            : profile?.status === "scan_pending" ||
                profile?.status === "scan_running"
              ? "SCAN QUEUED"
              : "SURFACES ONLY"}
        </span>
      </div>

      <div className="p-4">
        <p
          className="mb-4 font-mono text-[10px] uppercase tracking-[0.16em]"
          style={{ color: "var(--v3-ink-300)" }}
        >
          {"// KNOWN REPO · PACKAGE · LAUNCH · SITE SURFACES"}
        </p>

      {aisoHighScore && aisoScan && aisoScan.score != null && (
        <section
          aria-label="AI discoverability (AISO)"
          className="mb-4 rounded-[2px] p-3"
          style={{
            background: "var(--v3-bg-025)",
            border: "1px solid var(--v3-line-200)",
            boxShadow: "inset 2px 0 0 var(--v3-sig-green)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--v3-ink-300)" }}
              >
                AI discoverability
                <span
                  className="ml-2"
                  style={{ color: "var(--v3-ink-400)" }}
                >
                  {"// AISO"}
                </span>
              </p>
              <p
                className="mt-1 font-mono text-3xl font-semibold tabular-nums"
                style={{ color: "var(--v3-sig-green)" }}
              >
                {aisoScan.score}
                <span
                  className="ml-1 text-sm"
                  style={{ color: "var(--v3-ink-400)" }}
                >
                  /100
                </span>
              </p>
              <p
                className="mt-1 text-[11px]"
                style={{ color: "var(--v3-ink-300)" }}
              >
                Strong surface for AI agents and citation engines.
              </p>
            </div>
            <a
              href={aisoScan.resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="v3-button"
            >
              View report
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
          {aisoTopDimensions.length > 0 && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {aisoTopDimensions.map((dimension) => (
                <div
                  key={dimension.key}
                  className="rounded-[2px] px-2.5 py-2"
                  style={{
                    background: "var(--v3-bg-050)",
                    border: "1px solid var(--v3-line-100)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="truncate text-[11px]"
                      style={{ color: "var(--v3-ink-200)" }}
                    >
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
                  <div
                    className="mt-1 h-1 overflow-hidden rounded-[1px]"
                    style={{ background: "var(--v3-bg-200)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pctOfWeight(dimension)}%`,
                        background:
                          dimension.status === "pass"
                            ? "var(--v3-sig-green)"
                            : dimension.status === "warn"
                              ? "var(--v3-sig-amber)"
                              : "var(--v3-sig-red)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {surfaces.map((surface) => {
          const Icon = surface.icon;
          const content = (
            <>
              <span className="relative flex size-7 shrink-0 items-center justify-center">
                <EntityLogo
                  src={surface.logoUrl ?? null}
                  name={surface.logoName ?? surface.value}
                  size={28}
                  shape="square"
                  alt=""
                />
                {!surface.logoUrl ? (
                  <Icon
                    className="absolute size-3.5"
                    aria-hidden
                    style={{
                      color: surface.active
                        ? "var(--v3-acc)"
                        : "var(--v3-ink-400)",
                    }}
                  />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block font-mono text-[10px] uppercase tracking-[0.16em]"
                  style={{ color: "var(--v3-ink-400)" }}
                >
                  {surface.label}
                </span>
                <span
                  className="block truncate text-sm"
                  style={{
                    color: surface.active
                      ? "var(--v3-ink-100)"
                      : "var(--v3-ink-400)",
                  }}
                >
                  {surface.value}
                </span>
                <span
                  className="block truncate text-[11px]"
                  style={{ color: "var(--v3-ink-400)" }}
                >
                  {surface.detail}
                </span>
              </span>
              {surface.href && (
                <ExternalLink
                  className="size-3"
                  style={{ color: "var(--v3-ink-400)" }}
                  aria-hidden
                />
              )}
            </>
          );

          return surface.href ? (
            <a
              key={surface.label}
              href={surface.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-[2px] p-2.5 transition-colors hover:[background:var(--v3-bg-100)] hover:[border-color:var(--v3-line-300)]"
              style={{
                background: "var(--v3-bg-050)",
                border: "1px solid var(--v3-line-100)",
              }}
            >
              {content}
            </a>
          ) : (
            <div
              key={surface.label}
              className="flex items-center gap-2.5 rounded-[2px] p-2.5 opacity-70"
              style={{
                background: "var(--v3-bg-025)",
                border: "1px dashed var(--v3-line-100)",
              }}
            >
              {content}
            </div>
          );
        })}
      </div>

      {!aisoScan && aisoUiStatus !== "scanned" && aisoUiStatus !== "none" && aisoOwner && aisoName && (
        <div
          className="mt-4 flex items-center justify-between gap-3 rounded-[2px] p-3"
          style={{
            background: "var(--v3-bg-025)",
            border: "1px solid var(--v3-line-100)",
          }}
        >
          <div className="min-w-0">
            <p
              className="font-mono text-[10px] uppercase tracking-[0.16em]"
              style={{ color: "var(--v3-ink-400)" }}
            >
              AISO scan
            </p>
            <p className={`mt-1 text-[11px] ${aisoStatusTone(aisoUiStatus)}`}>
              {aisoUiStatus === "failed"
                ? "Last scan failed — retry to enqueue another."
                : aisoUiStatus === "rate_limited"
                  ? "Rate limited upstream — retry to re-queue."
                  : "Scan queued — refresh to check status."}
            </p>
          </div>
          <AisoRetryButton
            owner={aisoOwner}
            name={aisoName}
            status={aisoUiStatus}
          />
        </div>
      )}

          {aisoScan && (
        <div
          className="mt-4 rounded-[2px] p-3"
          style={{
            background: "var(--v3-bg-025)",
            border: "1px solid var(--v3-line-100)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <a
              href={aisoScan.resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors"
              style={{ color: "var(--v3-ink-200)" }}
            >
              <Search
                className="size-3.5"
                style={{ color: "var(--v3-acc)" }}
                aria-hidden
              />
              AISO real website scan
              <ExternalLink className="size-3" aria-hidden />
            </a>
            <div className="flex items-center gap-2">
              <span
                className="font-mono text-sm font-semibold tabular-nums"
                style={{
                  color:
                    aisoScan.score != null
                      ? "var(--v3-ink-100)"
                      : aisoUiStatus === "failed"
                        ? "var(--v3-sig-red)"
                        : aisoUiStatus === "rate_limited" || aisoUiStatus === "queued"
                          ? "var(--v3-sig-amber)"
                          : "var(--v3-ink-400)",
                }}
              >
                {aisoScan.score != null
                  ? `${aisoScan.score}/100`
                  : aisoScan.status}
              </span>
              {aisoUiStatus !== "scanned" && aisoUiStatus !== "none" && aisoOwner && aisoName && (
                <AisoRetryButton
                  owner={aisoOwner}
                  name={aisoName}
                  status={aisoUiStatus}
                />
              )}
            </div>
          </div>

          {aisoScan.score != null && (
            <div
              className="mt-2 h-2 overflow-hidden rounded-[1px]"
              style={{ background: "var(--v3-bg-200)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${aisoScan.score}%`,
                  background: "var(--v3-acc)",
                  boxShadow: "0 0 8px var(--v3-acc-glow)",
                }}
              />
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {aisoScan.dimensions.slice(0, 9).map((dimension) => (
              <div
                key={dimension.key}
                className="rounded-[2px] px-2.5 py-2"
                style={{
                  background: "var(--v3-bg-050)",
                  border: "1px solid var(--v3-line-100)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="truncate text-[11px]"
                    style={{ color: "var(--v3-ink-200)" }}
                  >
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
                <div
                  className="mt-1 h-1 overflow-hidden rounded-[1px]"
                  style={{ background: "var(--v3-bg-200)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pctOfWeight(dimension)}%`,
                      background:
                        dimension.status === "pass"
                          ? "var(--v3-sig-green)"
                          : dimension.status === "warn"
                            ? "var(--v3-sig-amber)"
                            : "var(--v3-sig-red)",
                    }}
                  />
                </div>
                {dimension.issuesCount > 0 && (
                  <p
                    className="mt-1 text-[10px]"
                    style={{ color: "var(--v3-ink-400)" }}
                  >
                    {dimension.issuesCount} issue{dimension.issuesCount === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div
            className="mt-3 rounded-[2px] p-2.5"
            style={{
              background: "var(--v3-bg-050)",
              border: "1px solid var(--v3-line-100)",
            }}
          >
            <p
              className="font-mono text-[10px] uppercase tracking-[0.16em]"
              style={{ color: "var(--v3-ink-400)" }}
            >
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
            <div
              className="mt-3 rounded-[2px] p-2.5"
              style={{
                background: "var(--v3-bg-050)",
                border: "1px solid var(--v3-line-100)",
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  className="font-mono text-[10px] uppercase tracking-[0.16em]"
                  style={{ color: "var(--v3-ink-400)" }}
                >
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
                    className="inline-flex items-center gap-1.5 rounded-[2px] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]"
                    style={
                      signal.active
                        ? {
                            background: "var(--v3-bg-100)",
                            border: "1px solid var(--v3-line-200)",
                            color: "var(--v3-sig-green)",
                          }
                        : {
                            background: "var(--v3-bg-025)",
                            border: "1px solid var(--v3-line-100)",
                            color: "var(--v3-ink-400)",
                          }
                    }
                  >
                    <span
                      className="shrink-0 size-1.5"
                      style={{
                        background: signal.active
                          ? "var(--v3-sig-green)"
                          : "var(--v3-ink-500)",
                      }}
                      aria-hidden
                    />
                    {signal.label}: {signal.value}
                  </span>
                ))}
              </div>
            </div>
          )}

          {engines.some((engine) => engine.total > 0) && (
            <div
              className="mt-3 rounded-[2px] p-2.5"
              style={{
                background: "var(--v3-bg-050)",
                border: "1px solid var(--v3-line-100)",
              }}
            >
              <p
                className="font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                AI citation engines
              </p>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {engines.map((engine) => (
                  <div
                    key={engine.engine}
                    className="rounded-[2px] px-2 py-2"
                    style={{
                      background: "var(--v3-bg-025)",
                      border: "1px solid var(--v3-line-100)",
                    }}
                  >
                    <p
                      className="truncate font-mono text-[10px] uppercase tracking-[0.16em]"
                      style={{ color: "var(--v3-ink-300)" }}
                    >
                      {engine.engine}
                    </p>
                    <p
                      className="mt-1 font-mono text-sm tabular-nums"
                      style={{
                        color:
                          engine.cited > 0
                            ? "var(--v3-sig-green)"
                            : "var(--v3-ink-400)",
                      }}
                    >
                      {engine.cited}/{engine.total || 0} cited
                    </p>
                    <p
                      className="mt-0.5 text-[10px]"
                      style={{ color: "var(--v3-ink-400)" }}
                    >
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
                  className="text-[11px] leading-snug"
                  style={{ color: "var(--v3-ink-300)" }}
                >
                  <span
                    className="font-mono uppercase tracking-[0.16em]"
                    style={{ color: "var(--v3-sig-amber)" }}
                  >
                    {issue.severity}
                  </span>{" "}
                  <span style={{ color: "var(--v3-ink-200)" }}>{issue.title}</span>
                </li>
              ))}
            </ul>
          )}

          <p
            className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em]"
            style={{ color: "var(--v3-ink-400)" }}
          >
            {aisoScan.completedAt
              ? `scanned ${getRelativeTime(aisoScan.completedAt)}`
              : `scan status: ${aisoScan.status}`}
          </p>
        </div>
      )}
      </div>
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
    <div
      className="rounded-[2px] px-2 py-2"
      style={{
        background: "var(--v3-bg-025)",
        border: "1px solid var(--v3-line-100)",
      }}
    >
      <p
        className="truncate font-mono text-[10px] uppercase tracking-[0.16em]"
        style={{ color: "var(--v3-ink-400)" }}
      >
        {label}
      </p>
      <p
        className="mt-1 font-mono text-xs tabular-nums"
        style={{
          color: positive ? "var(--v3-sig-green)" : "var(--v3-sig-amber)",
        }}
      >
        {formatDetailValue(raw)}
      </p>
    </div>
  );
}

export default ProjectSurfaceMap;
