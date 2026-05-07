// Completeness strip — answers "how much of this profile is populated?"
//
// Renders a horizontal row of source chips. Each chip shows the source
// brand icon plus its 7d mention count. Active sources (count > 0) get
// the brand colour; inactive sources fade — the user can see at a glance
// which signals fired and which haven't.
//
// Derived purely from `repo.mentions.perSource`. No async hooks, no extra
// data load. Lives on the repo detail page above the mention feed.

import type { JSX } from "react";
import {
  Brain,
  FileText,
  Package,
  DollarSign,
} from "lucide-react";

import {
  GithubIcon,
  HackerNewsIcon,
  RedditIcon,
  BlueskyIcon,
  DevtoIcon,
  LobstersIcon,
  XIcon,
  ProductHuntIcon,
} from "@/components/brand/BrandIcons";
import type { Repo, SocialPlatform } from "@/lib/types";

type IconCmp = (props: { size?: number; className?: string }) => JSX.Element;

// Brand icons forced to monochrome so the glyph paints in `currentColor`.
// Without this, dev.to renders #0A0A0A on the dark detail-page bg and is
// invisible; Lobsters' inset cutout disappears at chip scale. The chip
// styles below give every source a consistent foreground colour.
const NpmIcon: IconCmp = (p) => <Package {...p} />;
const HfIcon: IconCmp = (p) => <Brain {...p} />;
const ArxivIcon: IconCmp = (p) => <FileText {...p} />;
const FundingIcon: IconCmp = (p) => <DollarSign {...p} />;
const XMono: IconCmp = (p) => <XIcon {...p} monochrome />;
const RedditMono: IconCmp = (p) => <RedditIcon {...p} monochrome />;
const HnMono: IconCmp = (p) => <HackerNewsIcon {...p} monochrome />;
const BlueskyMono: IconCmp = (p) => <BlueskyIcon {...p} monochrome />;
const DevtoMono: IconCmp = (p) => <DevtoIcon {...p} monochrome />;
const LobstersMono: IconCmp = (p) => <LobstersIcon {...p} monochrome />;
const PhMono: IconCmp = (p) => <ProductHuntIcon {...p} monochrome />;
const GithubMono: IconCmp = (p) => <GithubIcon {...p} monochrome />;

interface SourceDef {
  platform: Exclude<SocialPlatform, "github">;
  label: string;
  Icon: IconCmp;
}

const SOURCES: ReadonlyArray<SourceDef> = [
  { platform: "twitter", label: "X", Icon: XMono },
  { platform: "reddit", label: "Reddit", Icon: RedditMono },
  { platform: "hackernews", label: "HN", Icon: HnMono },
  { platform: "bluesky", label: "Bluesky", Icon: BlueskyMono },
  { platform: "devto", label: "dev.to", Icon: DevtoMono },
  { platform: "lobsters", label: "Lobsters", Icon: LobstersMono },
  { platform: "producthunt", label: "PH", Icon: PhMono },
  { platform: "npm", label: "npm", Icon: NpmIcon },
  { platform: "huggingface", label: "HF", Icon: HfIcon },
  { platform: "arxiv", label: "arXiv", Icon: ArxivIcon },
  { platform: "funding", label: "Funding", Icon: FundingIcon },
];

export function CompletenessStrip({ repo }: { repo: Repo }) {
  const ps = repo.mentions?.perSource;
  // Total active sources (count7d > 0) — the headline "X / 11 sources fired".
  const total = SOURCES.length + 1; // +1 for the always-active GitHub source
  const active =
    1 +
    SOURCES.reduce((acc, src) => {
      const c7 = ps?.[src.platform]?.count7d ?? 0;
      return acc + (c7 > 0 ? 1 : 0);
    }, 0);

  return (
    <div className="completeness-strip" data-active={active} data-total={total}>
      <div className="completeness-strip-head">
        <span className="completeness-strip-label">Coverage</span>
        <span className="completeness-strip-count">
          {active} / {total} sources fired (7d)
        </span>
      </div>
      <div className="completeness-strip-row" role="list">
        {/* GitHub is always present — the repo IS a GitHub object, so chip
            stays solid by definition. */}
        <span
          className="completeness-strip-chip is-active"
          role="listitem"
          title="GitHub: present"
        >
          <GithubMono size={14} />
          <span className="completeness-strip-count-num">·</span>
        </span>
        {SOURCES.map(({ platform, label, Icon }) => {
          const c7 = ps?.[platform]?.count7d ?? 0;
          const isActive = c7 > 0;
          return (
            <span
              key={platform}
              className={
                "completeness-strip-chip" + (isActive ? " is-active" : "")
              }
              role="listitem"
              title={`${label}: ${isActive ? `${c7} mention${c7 === 1 ? "" : "s"} (7d)` : "no recent mentions"}`}
            >
              <Icon size={14} />
              {isActive ? (
                <span className="completeness-strip-count-num">{c7}</span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
