import Link from "next/link";

import { FreshnessPill } from "@/components/shell/FreshnessPill";

export const TOOLS_FILTERS = [
  { id: "all", label: "All" },
  { id: "charts", label: "Charts" },
  { id: "estimators", label: "Estimators" },
  { id: "contribute", label: "Contribute" },
] as const;

export type ToolsFilter = (typeof TOOLS_FILTERS)[number]["id"];

interface ToolsHubHeroProps {
  filter: ToolsFilter;
  toolsLive: number;
  toolsTotal: number;
  fetchedAt: string | null;
}

function ageLabel(iso: string | null): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return "now";
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}M AGO`;
  const h = Math.round(diff / 3_600_000);
  if (h < 24) return `${h}H AGO`;
  const d = Math.round(diff / 86_400_000);
  if (d < 7) return `${d}D AGO`;
  return `${Math.round(d / 7)}W AGO`;
}

export function ToolsHubHero({
  filter,
  toolsLive,
  toolsTotal,
  fetchedAt,
}: ToolsHubHeroProps) {
  return (
    <header className="hero tools-hub-hero">
      <div className="hero-eyebrow">
        <span className="hero-eyebrow-dot" aria-hidden="true" />
        <span className="hero-eyebrow-tag">/TOOLS</span>
        <span className="hero-eyebrow-sep">·</span>
        <span>{toolsLive} share-worthy utilities</span>
        <span className="hero-eyebrow-sep">·</span>
        <FreshnessPill source="repos" fetchedAt={fetchedAt} prefix="TOOLBOX" />
      </div>

      <div className="hero-headline">
        <div>
          <h1>
            Tools that make GitHub scanning
            <br />
            <span className="hero-accent">shareable.</span>
          </h1>
          <p className="hero-sub">
            Pin your repos, rank them, plot the curves, freeze the daily top-10
            — then screenshot the result and post it. Every tool ships with a
            built-in share card so your scan reads as a clean post on X, Reddit,
            or Discord.
          </p>
        </div>

        <nav
          className="segmented"
          role="group"
          aria-label="Tool filter"
          style={{ alignSelf: "end" }}
        >
          {TOOLS_FILTERS.map((item) => (
            <Link
              key={item.id}
              href={item.id === "all" ? "/tools" : `/tools?filter=${item.id}`}
              className={item.id === filter ? "on" : ""}
              prefetch={false}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="hero-meta-row">
        <div className="hero-meta-pair">
          <span className="hero-meta-label">Tools live</span>
          <span className="hero-meta-value">
            <b>{toolsLive}</b> / {toolsTotal}
          </span>
        </div>
        <div className="hero-meta-pair">
          <span className="hero-meta-label">Freshness</span>
          <span className="hero-meta-value">{ageLabel(fetchedAt)}</span>
        </div>
        <div className="hero-meta-pair">
          <span className="hero-meta-label">Share targets</span>
          <span className="hero-meta-value">X · REDDIT · DISCORD</span>
        </div>
        <div className="hero-meta-pair">
          <span className="hero-meta-label">Refresh budget</span>
          <span className="hero-meta-value">10M ROLLUP</span>
        </div>
      </div>
    </header>
  );
}
