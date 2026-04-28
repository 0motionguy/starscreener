// /research - Research signal terminal.
//
// Live sources:
//   - Hugging Face trending models.
//   - arXiv recent papers for cs.AI / cs.CL / cs.LG.
//
// Server component. Pulls fresh payloads from the data store on each render via
// refreshResearchSignalsFromStore(), which rate-limits Redis reads internally.

import type { Metadata } from "next";
import Link from "next/link";
import { Microscope } from "lucide-react";
import { StatStrip } from "@/components/ui/StatStrip";

const RESEARCH_GREEN = "#22c55e";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Research - TrendingRepo",
  description:
    "Hugging Face trending models and arXiv cs.AI / cs.CL / cs.LG recent papers, with cross-links to tracked GitHub repos.",
  alternates: { canonical: "/research" },
};

const HF_TOP = 30;
const ARXIV_TOP = 30;

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default async function ResearchPage() {
  await refreshResearchSignalsFromStore();
  const hf = getHuggingFaceTrending();
  const arxiv = getArxivRecent();

  const hfModels = hf?.models?.slice(0, HF_TOP) ?? [];
  const papers = arxiv?.papers?.slice(0, ARXIV_TOP) ?? [];
  const linkedPapers = papers.filter((p) => p.linkedRepos.length > 0).length;
  const cold = hfModels.length === 0 && papers.length === 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="mb-6">
          <StatStrip
            eyebrow="// RESEARCH · IN DEVELOPMENT"
            status="SCOPING — NO ETA"
            accent={RESEARCH_GREEN}
            stats={[
              { label: "Status", value: "Scoping", tone: "accent" },
              { label: "Channels Planned", value: "3", hint: "arXiv · PWC · HF" },
              {
                label: "Cross-Signal Slot",
                value: "5th",
                hint: "after Bluesky v1",
              },
              { label: "ETA", value: "—", hint: "no deadline yet" },
            ]}
          />
        </div>

        <section
          className="p-8"
          style={{
            background: "var(--v3-bg-025)",
            border: "1px dashed var(--v3-line-100)",
            borderRadius: 2,
          }}
        >
          <div className="mb-4 flex items-center gap-3">
            <Microscope
              className="h-5 w-5 shrink-0"
              style={{ color: RESEARCH_GREEN }}
            />
            <h2
              className="v2-mono text-lg font-bold uppercase tracking-[0.18em]"
              style={{ color: RESEARCH_GREEN }}
            >
              {"// scope"}
            </h2>
          </div>
          <ul
            className="space-y-2 text-sm"
            style={{ color: "var(--v3-ink-300)" }}
          >
            <li>
              <span style={{ color: "var(--v3-ink-100)" }}>arXiv adapter</span>{" "}
              — pull new submissions in cs.AI / cs.CL / cs.LG, score by 24h
              download velocity + author H-index, link papers to GitHub repos
              named in the abstract or footnotes.
            </li>
            <li>
              <span style={{ color: "var(--v3-ink-100)" }}>Papers With Code</span>{" "}
              — track SOTA leaderboard climbers and surface their associated
              repos when a benchmark gets a fresh entry.
            </li>
            <li>
              <span style={{ color: "var(--v3-ink-100)" }}>HuggingFace</span> —
              model page download velocity + trending spaces. Cross-link to the
              source repo when one is declared.
            </li>
            <li>
              <span style={{ color: "var(--v3-ink-100)" }}>
                Cross-signal upgrade
              </span>{" "}
              — add a 5th channel to the cross-signal score so a paper hitting
              #1 on Papers With Code lights up its associated GitHub repo on
              the homepage breakouts feed.
            </li>
          </ul>

          <div
            className="mt-6 pt-6 text-xs"
            style={{
              borderTop: "1px solid var(--v3-line-100)",
              color: "var(--v3-ink-400)",
            }}
          >
            {"// no ETA — scoping after the cross-signal v1 + Bluesky integration land"}
          </div>
        )}

        <p
          className="mt-6 text-xs"
          style={{ color: "var(--v3-ink-400)" }}
        >
          In the meantime:{" "}
          <Link
            href="/breakouts"
            className="hover:underline"
            style={{ color: RESEARCH_GREEN }}
          >
            Cross-Signal Breakouts
          </Link>{" "}
          covers the GitHub + Reddit + HN + Bluesky agreement layer.
        </p>
      </div>
    </main>
  );
}

function ColdState() {
  return (
    <section className="rounded-md border border-dashed border-border-primary bg-bg-secondary/40 p-8">
      <div className="flex items-center gap-3 mb-4">
        <Microscope className="w-5 h-5 text-accent-green shrink-0" />
        <h2 className="text-lg font-bold uppercase tracking-wider text-accent-green">
          {"// cold start"}
        </h2>
      </div>
      <p className="text-sm text-text-secondary">
        No research signals in the cache yet. The collectors run every 3h via
        GitHub Actions; the next run will populate this page.
      </p>
    </section>
  );
}
