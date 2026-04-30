// /tools — V4 hub.
//
// Landing surface for analyst tools. Mockup: tools.html.
//
// Tile grid (4 col-3) + mini-list grid (4-6 MiniListCard) +
// Revenue estimator callout. All composition; no per-tool data
// fetching here — each tool owns its own page.

import type { Metadata } from "next";

import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { LiveDot } from "@/components/ui/LiveDot";
import { ToolTile } from "@/components/tools/ToolTile";
import { MiniListCard, type MiniListItem } from "@/components/tools/MiniListCard";

export const runtime = "nodejs";
// Static surface — tile metadata + mini-list seeds. ISR cadence matches
// the 30-min refresh used elsewhere; the underlying mini-list data is
// derived from the same momentum pipeline.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Tools — TrendingRepo",
  description:
    "Charts, lists, and exports built from the same momentum pipeline. Compare repos, plot star history, browse the consensus treemap.",
};

interface HubTile {
  num: string;
  title: string;
  desc: string;
  href: string;
  status: "live" | "soon";
  active?: boolean;
}

const TILES: HubTile[] = [
  {
    num: "// 01",
    title: "Star History",
    desc: "Plot up to six repos head-to-head. Export as PNG with three editorial themes (Blueprint, Neon, NYT).",
    href: "/tools/star-history",
    status: "soon",
  },
  {
    num: "// 02",
    title: "Tier List",
    desc: "Drag the day's movers into S → F bands. Share a permalink with friends or coworkers.",
    href: "/tierlist",
    status: "live",
    active: true,
  },
  {
    num: "// 03",
    title: "Compare",
    desc: "Multi-repo side-by-side: stars, momentum, cross-source agreement, contributors. Up to four at a time.",
    href: "/compare",
    status: "live",
  },
  {
    num: "// 04",
    title: "Mindshare",
    desc: "The bubble map — momentum × scale across 220 movers. Click any bubble for its repo detail.",
    href: "/mindshare",
    status: "live",
  },
];

interface MiniBoardSeed {
  title: string;
  badge?: string;
  href: string;
  items: MiniListItem[];
  cta?: string;
}

// Static seeds — the production wiring for these mini-lists comes
// from /api/skills, /api/mcp, /api/agent-commerce, /api/repos. Keeping
// the hub static here means it serves at edge speed regardless of
// pipeline state; users one-click into the live page for fresh data.
const MINI_BOARDS: MiniBoardSeed[] = [
  {
    title: "TOP · CLAUDE SKILLS",
    badge: "7D",
    href: "/skills",
    items: [
      { name: "anthropics/skills", value: "4.92" },
      { name: "context-collapse", value: "4.71" },
      { name: "skill-router", value: "4.55" },
      { name: "memory-write", value: "4.41" },
      { name: "delta-log-append", value: "4.30" },
    ],
    cta: "OPEN FULL BOARD",
  },
  {
    title: "TOP · MCP SERVERS",
    badge: "7D",
    href: "/mcp",
    items: [
      { name: "github-mcp", value: "4.84" },
      { name: "filesystem-mcp", value: "4.62" },
      { name: "browser-mcp", value: "4.50" },
      { name: "linear-mcp", value: "4.37" },
      { name: "slack-mcp", value: "4.21" },
    ],
    cta: "OPEN FULL BOARD",
  },
  {
    title: "TOP · AGENT COMMERCE",
    badge: "24H",
    href: "/agent-commerce",
    items: [
      { name: "x402 / Base", value: "+312%" },
      { name: "OpenRouter agents", value: "+184%" },
      { name: "AgentKit deals", value: "+97%" },
      { name: "Coinbase agents", value: "+62%" },
      { name: "Stripe AgentPay", value: "+41%" },
    ],
    cta: "OPEN FULL BOARD",
  },
  {
    title: "TOP · REPOS",
    badge: "24H",
    href: "/top10",
    items: [
      { name: "anthropics/skills", value: "+18.2k" },
      { name: "vercel/next.js", value: "+14.4k" },
      { name: "openai/responses", value: "+9.8k" },
      { name: "ggerganov/llama.cpp", value: "+8.4k" },
      { name: "huggingface/transformers", value: "+7.1k" },
    ],
    cta: "OPEN FULL BOARD",
  },
  {
    title: "TOP · LLMS",
    badge: "7D",
    href: "/model-usage",
    items: [
      { name: "Claude Sonnet 4.6", value: "4.92" },
      { name: "GPT-5", value: "4.71" },
      { name: "Claude Opus 4.7", value: "4.65" },
      { name: "Gemini 2.5 Pro", value: "4.32" },
      { name: "DeepSeek V3.2", value: "4.18" },
    ],
    cta: "OPEN FULL BOARD",
  },
  {
    title: "TOP · BREAKOUTS",
    badge: "24H",
    href: "/breakouts",
    items: [
      { name: "claude-code-skills", value: "+812%" },
      { name: "agno-agents", value: "+540%" },
      { name: "smol-tools", value: "+412%" },
      { name: "x402-mcp", value: "+288%" },
      { name: "deepseek-router", value: "+211%" },
    ],
    cta: "OPEN FULL BOARD",
  },
];

function ToolPreview({ kind }: { kind: HubTile["title"] }) {
  // Tiny SVG placeholders for each tile. Mockup-canonical 60×34. Pure
  // decoration — no data drives them.
  switch (kind) {
    case "Star History":
      return (
        <svg width={60} height={34} viewBox="0 0 60 34" fill="none">
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
    case "Tier List":
      return (
        <svg width={60} height={34} viewBox="0 0 60 34" fill="none">
          {[0, 1, 2, 3, 4].map((i) => (
            <rect
              key={i}
              x={2}
              y={2 + i * 6}
              width={56}
              height={4}
              fill={
                ["var(--v4-tier-s)", "var(--v4-tier-a)", "var(--v4-tier-b)", "var(--v4-tier-c)", "var(--v4-tier-d)"][
                  i
                ]
              }
              opacity={0.85}
            />
          ))}
        </svg>
      );
    case "Compare":
      return (
        <svg width={60} height={34} viewBox="0 0 60 34" fill="none">
          <path d="M2 28 L18 18 L34 22 L50 8 L58 4" stroke="var(--v4-acc)" strokeWidth={1.5} fill="none" />
          <path d="M2 30 L18 24 L34 14 L50 18 L58 10" stroke="var(--v4-violet)" strokeWidth={1.5} fill="none" />
          <path d="M2 32 L18 28 L34 30 L50 24 L58 22" stroke="var(--v4-cyan)" strokeWidth={1.5} fill="none" />
        </svg>
      );
    case "Mindshare":
      return (
        <svg width={60} height={34} viewBox="0 0 60 34" fill="none">
          <circle cx={14} cy={20} r={8} fill="var(--v4-acc)" opacity={0.85} />
          <circle cx={32} cy={14} r={6} fill="var(--v4-cyan)" opacity={0.85} />
          <circle cx={44} cy={22} r={5} fill="var(--v4-violet)" opacity={0.85} />
          <circle cx={52} cy={10} r={3} fill="var(--v4-money)" opacity={0.85} />
        </svg>
      );
    default:
      return null;
  }
}

export default function ToolsPage() {
  return (
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <b>TOOLS</b> · TERMINAL · /TOOLS
          </>
        }
        h1="Tools for analysts."
        lede="Charts, lists, and exports built from the same momentum pipeline. Compare repos head-to-head, plot star history, browse the consensus treemap."
        clock={
          <>
            <span className="big">{TILES.filter((t) => t.status === "live").length} / {TILES.length}</span>
            <span className="muted">TOOLS LIVE</span>
            <LiveDot label="PIPELINE LIVE" />
          </>
        }
      />

      <SectionHead
        num="// 01"
        title="Featured tools"
        meta={
          <>
            <b>{TILES.length}</b> total · {TILES.filter((t) => t.status === "live").length} live
          </>
        }
      />
      <div className="grid">
        {TILES.map((tile) => (
          <div className="col-3" key={tile.num}>
            <ToolTile
              num={tile.status === "soon" ? `${tile.num} · SOON` : tile.num}
              title={tile.title}
              desc={tile.desc}
              active={tile.active}
              preview={<ToolPreview kind={tile.title} />}
              foot={
                tile.status === "live" ? (
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
              href={tile.status === "live" ? tile.href : undefined}
            />
          </div>
        ))}
      </div>

      <SectionHead
        num="// 02"
        title="Quick-browse · top boards"
        meta={
          <>
            <b>6</b> categories · 5 picks each
          </>
        }
      />
      <div className="grid">
        {MINI_BOARDS.map((board) => (
          <div className="col-4" key={board.title}>
            <MiniListCard
              title={board.title}
              badge={board.badge}
              items={board.items}
              cta={board.cta}
              href={board.href}
            />
          </div>
        ))}
      </div>

      <SectionHead
        num="// 03"
        title="Revenue estimator"
        meta={<>self-reported + verified · ARR overlays</>}
      />
      <div className="grid">
        <div className="col-12">
          <ToolTile
            num="// 03 · TOOL"
            title="Revenue Estimate"
            desc="Drop a repo URL or owner/name. Returns ARR overlays, self-reported MRR, and TrustMRR claim status. Useful before pitching a partnership or investing time."
            href="/tools/revenue-estimate"
            foot={
              <>
                <LiveDot label="LIVE" />
                <span>OPEN ESTIMATOR →</span>
              </>
            }
          />
        </div>
      </div>
    </main>
  );
}
