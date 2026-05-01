// /tools — V4 hub.
//
// Landing surface for analyst tools. Mockup: tools.html (master plan W6).
// Three sections — Charts (Star History, Treemap), Estimators (Revenue
// Estimate), Contribute (Submit Revenue). Pure composition; each tool
// owns its own page and data fetching.
//
// Server component. Inline styles use --v4-* tokens only — no hardcoded
// hex values. Layout reuses the V4 page chrome shared with /breakouts,
// /digest, /consensus etc. (`home-surface` + `grid` + `col-*`).

import type { Metadata } from "next";

import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { LiveDot } from "@/components/ui/LiveDot";
import { ToolTile } from "@/components/tools/ToolTile";
import { absoluteUrl } from "@/lib/seo";

export const runtime = "nodejs";
// Tool metadata changes only when a new tool ships. 10-min ISR keeps the
// hub cheap to serve while picking up additions promptly.
export const revalidate = 600;

const HUB_TITLE = "Tools — TrendingRepo";
const HUB_DESCRIPTION =
  "Analyst tools for the open-source trend map: plot multi-repo star history, browse the consensus treemap, estimate repo revenue, and contribute self-reported MRR.";

export function generateMetadata(): Metadata {
  return {
    title: HUB_TITLE,
    description: HUB_DESCRIPTION,
    alternates: { canonical: absoluteUrl("/tools") },
    openGraph: {
      title: HUB_TITLE,
      description: HUB_DESCRIPTION,
      url: absoluteUrl("/tools"),
      type: "website",
    },
  };
}

interface ToolEntry {
  num: string;
  title: string;
  desc: string;
  href: string;
  status: "live" | "soon";
}

const CHART_TOOLS: ToolEntry[] = [
  {
    num: "// 01",
    title: "Star History",
    desc: "Plot up to six repos head-to-head with editorial export themes (Blueprint, Neon, NYT).",
    href: "/tools/star-history",
    status: "live",
  },
  {
    num: "// 02",
    title: "Treemap",
    desc: "Sector treemap of trending repos — area scales with momentum, color encodes category.",
    href: "/tools/treemap",
    status: "soon",
  },
];

const ESTIMATOR_TOOLS: ToolEntry[] = [
  {
    num: "// 01",
    title: "Revenue Estimate",
    desc: "Drop a repo. Returns ARR overlays, self-reported MRR, and TrustMRR claim status.",
    href: "/tools/revenue-estimate",
    status: "live",
  },
];

const CONTRIBUTE_TOOLS: ToolEntry[] = [
  {
    num: "// 01",
    title: "Submit Revenue",
    desc: "Add self-reported MRR/ARR for a project you maintain. Verified claims surface on the funding tape.",
    href: "/submit/revenue",
    status: "live",
  },
];

// Tiny inline previews — pure decoration, mockup-canonical 60×34. Tokens
// only; no hardcoded hex.
function ChartIcon({ kind }: { kind: "star-history" | "treemap" }) {
  if (kind === "star-history") {
    return (
      <svg width={60} height={34} viewBox="0 0 60 34" fill="none" aria-hidden="true">
        <path
          d="M2 30 L14 22 L26 24 L38 12 L50 6 L58 2"
          stroke="var(--v4-acc)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <path
          d="M2 32 L14 28 L26 26 L38 22 L50 18 L58 14"
          stroke="var(--v4-cyan)"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.65}
        />
      </svg>
    );
  }
  return (
    <svg width={60} height={34} viewBox="0 0 60 34" fill="none" aria-hidden="true">
      <rect x={2} y={2} width={28} height={20} fill="var(--v4-acc)" opacity={0.85} />
      <rect x={32} y={2} width={16} height={12} fill="var(--v4-cyan)" opacity={0.85} />
      <rect x={50} y={2} width={8} height={12} fill="var(--v4-violet)" opacity={0.85} />
      <rect x={32} y={16} width={26} height={6} fill="var(--v4-money)" opacity={0.85} />
      <rect x={2} y={24} width={56} height={8} fill="var(--v4-amber)" opacity={0.7} />
    </svg>
  );
}

function EstimatorIcon() {
  return (
    <svg width={60} height={34} viewBox="0 0 60 34" fill="none" aria-hidden="true">
      <path
        d="M4 28 L4 8 M4 28 L56 28"
        stroke="var(--v4-line-400)"
        strokeWidth={1}
        strokeLinecap="round"
      />
      {[12, 22, 32, 42, 52].map((x, i) => (
        <rect
          key={x}
          x={x - 3}
          y={26 - (i + 1) * 4}
          width={6}
          height={(i + 1) * 4}
          fill="var(--v4-money)"
          opacity={0.85}
        />
      ))}
    </svg>
  );
}

function ContributeIcon() {
  return (
    <svg width={60} height={34} viewBox="0 0 60 34" fill="none" aria-hidden="true">
      <rect
        x={6}
        y={6}
        width={48}
        height={22}
        rx={2}
        fill="none"
        stroke="var(--v4-acc)"
        strokeWidth={1.5}
      />
      <path
        d="M14 14 L46 14 M14 20 L36 20"
        stroke="var(--v4-cyan)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

function previewFor(title: string) {
  switch (title) {
    case "Star History":
      return <ChartIcon kind="star-history" />;
    case "Treemap":
      return <ChartIcon kind="treemap" />;
    case "Revenue Estimate":
      return <EstimatorIcon />;
    case "Submit Revenue":
      return <ContributeIcon />;
    default:
      return null;
  }
}

function ToolGrid({ tools }: { tools: ToolEntry[] }) {
  return (
    <div className="grid">
      {tools.map((tool) => (
        <div className="col-6" key={`${tool.title}-${tool.href}`}>
          <ToolTile
            num={tool.status === "soon" ? `${tool.num} · SOON` : tool.num}
            title={tool.title}
            desc={tool.desc}
            preview={previewFor(tool.title)}
            href={tool.status === "live" ? tool.href : undefined}
            foot={
              tool.status === "live" ? (
                <>
                  <LiveDot label="LIVE" />
                  <span>OPEN →</span>
                </>
              ) : (
                <>
                  <span style={{ color: "var(--v4-amber)" }}>● COMING SOON</span>
                  <span>WAITLIST →</span>
                </>
              )
            }
          />
        </div>
      ))}
    </div>
  );
}

export default function ToolsPage() {
  const allTools = [...CHART_TOOLS, ...ESTIMATOR_TOOLS, ...CONTRIBUTE_TOOLS];
  const liveCount = allTools.filter((t) => t.status === "live").length;

  return (
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <b>TOOLS</b> · TERMINAL · /TOOLS
          </>
        }
        h1="Tools for the trend desk."
        lede="Charts, estimators, and contributor surfaces built on the same momentum pipeline. Plot star history head-to-head, browse the consensus treemap, estimate repo revenue, or submit self-reported MRR for a project you maintain."
        clock={
          <>
            <span className="big">
              {liveCount} / {allTools.length}
            </span>
            <span className="muted">TOOLS LIVE</span>
            <LiveDot label="PIPELINE LIVE" />
          </>
        }
      />

      <SectionHead
        num="// 01"
        title="Charts"
        meta={
          <>
            <b>{CHART_TOOLS.length}</b> tools · multi-repo plots
          </>
        }
      />
      <ToolGrid tools={CHART_TOOLS} />

      <SectionHead
        num="// 02"
        title="Estimators"
        meta={<>ARR overlays · TrustMRR claims</>}
      />
      <ToolGrid tools={ESTIMATOR_TOOLS} />

      <SectionHead
        num="// 03"
        title="Contribute"
        meta={<>self-reported · verified surfaces</>}
      />
      <ToolGrid tools={CONTRIBUTE_TOOLS} />
    </main>
  );
}
