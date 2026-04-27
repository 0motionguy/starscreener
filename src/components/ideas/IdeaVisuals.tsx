import type { ReactNode } from "react";

import type { PublicIdea } from "@/lib/ideas";
import type { ReactionCounts } from "@/lib/reactions-shape";
import { cn, seededRandom } from "@/lib/utils";

const FALLBACK_CATEGORIES = [
  "Agents",
  "MCP",
  "DevTools",
  "Signals",
  "Design",
  "Infra",
] as const;

const PREVIEW_TITLES = [
  "signal.mcp",
  "anomaly.feed",
  "launch.card",
  "conviction.book",
  "agent.diff",
  "mobile.picks",
] as const;

const STACK_ROW_LABELS = ["Repos", "Agents", "Skills", "APIs", "Channels"] as const;

export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getIdeaCategory(idea: PublicIdea): string {
  if (idea.category) return titleCase(idea.category.replace(/[-_]/g, " "));
  const firstTag = idea.tags[0];
  if (firstTag) return titleCase(firstTag.replace(/[-_]/g, " "));
  return FALLBACK_CATEGORIES[hashString(idea.id) % FALLBACK_CATEGORIES.length];
}

export function getIdeaStackRows(idea: PublicIdea): { label: string; values: string[] }[] {
  const rows = parseStackFromBody(idea.body);
  if (!rows.some((row) => row.label === "Repos") && idea.targetRepos.length > 0) {
    rows.unshift({ label: "Repos", values: idea.targetRepos });
  }
  if (!rows.some((row) => row.label === "Channels") && idea.tags.length > 0) {
    rows.push({ label: "Channels", values: idea.tags.map((tag) => `# ${tag}`) });
  }
  return rows.filter((row) => row.values.length > 0);
}

function parseStackFromBody(body: string | null): { label: string; values: string[] }[] {
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const stackIndex = lines.findIndex((line) => line.trim().toLowerCase() === "stack:");
  if (stackIndex < 0) return [];
  const rows: { label: string; values: string[] }[] = [];
  for (const line of lines.slice(stackIndex + 1)) {
    if (!line.trim()) break;
    const match = line.match(/^-\s*([^:]+):\s*(.+)$/);
    if (!match) continue;
    const rawLabel = match[1].trim();
    const label =
      STACK_ROW_LABELS.find((item) => item.toLowerCase() === rawLabel.toLowerCase()) ??
      rawLabel;
    const values = match[2]
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    rows.push({ label, values });
  }
  return rows;
}

export function getIdeaSignal(
  idea: PublicIdea,
  reactionCounts: ReactionCounts,
  hotScore?: number,
): number {
  if (typeof hotScore === "number" && Number.isFinite(hotScore)) {
    return clamp(Math.round(48 + Math.log1p(Math.max(0, hotScore)) * 11), 42, 99);
  }

  const weighted =
    reactionCounts.build * 3 +
    reactionCounts.use +
    reactionCounts.buy * 5 +
    reactionCounts.invest * 8;
  const statusBoost =
    idea.buildStatus === "shipped"
      ? 16
      : idea.buildStatus === "building"
        ? 10
        : idea.buildStatus === "scoping"
          ? 5
          : 0;
  const seedBoost = hashString(idea.id) % 11;
  return clamp(38 + statusBoost + seedBoost + Math.round(Math.log1p(weighted) * 13), 32, 99);
}

export function getIdeaHistory(idea: PublicIdea, signal: number): number[] {
  const rand = seededRandom(`${idea.id}:${idea.title}`);
  const points = 14;
  const start = clamp(signal - 34 - Math.round(rand() * 18), 6, 72);
  const history: number[] = [];
  for (let i = 0; i < points; i += 1) {
    const t = i / (points - 1);
    const wobble = Math.round((rand() - 0.42) * 10);
    history.push(clamp(Math.round(start + (signal - start) * t + wobble), 1, 99));
  }
  history[points - 1] = signal;
  return history;
}

export function getIdeaDelta(history: number[]): number {
  if (history.length < 2) return 0;
  return history[history.length - 1] - history[Math.max(0, history.length - 8)];
}

export function Sparkline({
  data,
  className,
}: {
  data: number[];
  className?: string;
}) {
  const width = 96;
  const height = 34;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const points = data.map((value, index) => {
    const x = (index / Math.max(1, data.length - 1)) * width;
    const y = height - ((value - min) / (max - min || 1)) * (height - 6) - 3;
    return [x, y] as const;
  });
  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const gradientId = `idea-spark-${data.join("-")}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block h-[34px] w-24", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function IdeaLogoMark({
  idea,
  size = 40,
  className,
}: {
  idea: PublicIdea;
  size?: number;
  className?: string;
}) {
  const variant = hashString(idea.id) % 6;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 40 40",
    fill: "none",
    className: cn("shrink-0 text-text-primary", className),
    "aria-hidden": true,
  } as const;

  const frame = <rect x="0.5" y="0.5" width="39" height="39" rx="8" stroke="currentColor" opacity="0.18" />;
  if (variant === 0) {
    return (
      <svg {...common}>
        {frame}
        <circle cx="20" cy="20" r="3" fill="currentColor" />
        <circle cx="20" cy="20" r="7" stroke="currentColor" strokeWidth="1.4" opacity="0.8" />
        <circle cx="20" cy="20" r="12" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
        <circle cx="20" cy="20" r="16.5" stroke="currentColor" strokeWidth="1.4" opacity="0.16" />
      </svg>
    );
  }
  if (variant === 1) {
    return (
      <svg {...common}>
        {frame}
        <path d="M8 25 L14 16 L18 22 L22 11 L26 25 L32 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="22" cy="11" r="2.6" fill="currentColor" />
        <path d="M20 6 V34 M6 20 H34" stroke="currentColor" strokeWidth="0.9" opacity="0.16" />
      </svg>
    );
  }
  if (variant === 2) {
    return (
      <svg {...common}>
        {frame}
        <rect x="8" y="12" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" opacity="0.36" />
        <rect x="12" y="16" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M15 23 L18 20 L22 24 L25 21" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (variant === 3) {
    return (
      <svg {...common}>
        {frame}
        <rect x="10" y="22" width="4" height="10" rx="1" fill="currentColor" opacity="0.34" />
        <rect x="16" y="16" width="4" height="16" rx="1" fill="currentColor" opacity="0.55" />
        <rect x="22" y="10" width="4" height="22" rx="1" fill="currentColor" />
        <rect x="28" y="19" width="4" height="13" rx="1" fill="currentColor" opacity="0.45" />
      </svg>
    );
  }
  if (variant === 4) {
    return (
      <svg {...common}>
        {frame}
        <rect x="11" y="9" width="18" height="22" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M14 14 H22 M14 18 H26 M14 22 H24 M14 26 H20" stroke="currentColor" strokeWidth="1" opacity="0.38" />
        <path d="M24 22 H29 M26.5 19.5 V24.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      {frame}
      <rect x="14" y="8" width="12" height="21" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M19 25 H21" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M28 18 H33 M30 15 L33 18 L30 21" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StatusDot({ status }: { status: PublicIdea["buildStatus"] }) {
  const label = status === "abandoned" ? "Paused" : titleCase(status);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-text-tertiary">
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "shipped"
            ? "bg-functional shadow-[0_0_8px_rgba(34,197,94,0.65)]"
            : status === "building"
              ? "bg-brand shadow-[0_0_8px_rgba(245,110,15,0.55)]"
              : "bg-text-tertiary",
        )}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

export function DeltaPill({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[10px] font-semibold tabular-nums",
        up ? "text-functional" : "text-text-tertiary",
      )}
    >
      <svg
        viewBox="0 0 8 8"
        className={cn("size-2", !up && "rotate-180")}
        aria-hidden="true"
      >
        <path d="M4 1 L7 6 H1 Z" fill="currentColor" />
      </svg>
      {Math.abs(value)}
    </span>
  );
}

export function IdeaPreview({
  idea,
  history,
  compact = false,
}: {
  idea: PublicIdea;
  history: number[];
  compact?: boolean;
}) {
  const variant = hashString(idea.id) % 6;
  const label = PREVIEW_TITLES[variant];
  const target = idea.targetRepos[0] ?? "community/signal";
  const tags = idea.tags.length > 0 ? idea.tags : [getIdeaCategory(idea).toLowerCase()];

  return (
    <div className="relative min-h-[180px] overflow-hidden rounded-lg border border-white/8 bg-black/25">
      <PreviewChrome title={label} />
      <div className={cn("p-4", compact ? "min-h-[148px]" : "min-h-[214px]")}>
        {variant === 0 ? (
          <TerminalDigest target={target} tags={tags} />
        ) : variant === 1 ? (
          <AnomalyPreview idea={idea} />
        ) : variant === 2 ? (
          <CardsPreview target={target} history={history} />
        ) : variant === 3 ? (
          <PortfolioPreview target={target} tags={tags} />
        ) : variant === 4 ? (
          <DiffPreview idea={idea} />
        ) : (
          <SwipePreview idea={idea} />
        )}
      </div>
    </div>
  );
}

export function SidePanel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-white/8 bg-white/[0.025] p-4", className)}>
      <h2 className="mb-3 font-mono text-[10px] font-bold uppercase text-text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PreviewChrome({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2">
      <span className="flex gap-1" aria-hidden="true">
        <span className="size-1.5 rounded-full bg-white/15" />
        <span className="size-1.5 rounded-full bg-white/15" />
        <span className="size-1.5 rounded-full bg-white/15" />
      </span>
      <span className="flex-1 truncate text-center font-mono text-[10px] text-text-tertiary">
        {title}
      </span>
      <span className="w-8" aria-hidden="true" />
    </div>
  );
}

function TerminalDigest({ target, tags }: { target: string; tags: string[] }) {
  const rows = [
    [target, "+42%", "breakout"],
    [tags[0] ?? "agent", "+31%", "topic"],
    [tags[1] ?? "mcp", "+18%", "adjacent"],
    ["builder intent", "+12%", "rising"],
  ];
  return (
    <div className="flex flex-col gap-2 font-mono text-[11px]">
      <div className="text-[10px] text-text-tertiary">$ scout weekly-digest</div>
      {rows.map(([name, delta, kind], index) => (
        <div
          key={`${name}-${kind}`}
          className={cn(
            "grid grid-cols-[8px_1fr_auto] items-center gap-2 rounded-md border border-white/6 px-2.5 py-1.5",
            index === 0 ? "bg-white/[0.045]" : "bg-transparent",
          )}
        >
          <span className={cn("size-1.5 rounded-sm", index === 0 ? "bg-white" : "bg-white/30")} />
          <span className="truncate text-text-secondary">{name}</span>
          <span className="font-semibold text-text-primary">{delta}</span>
        </div>
      ))}
    </div>
  );
}

function AnomalyPreview({ idea }: { idea: PublicIdea }) {
  return (
    <svg viewBox="0 0 420 170" className="h-full min-h-[150px] w-full text-white" aria-hidden="true">
      {[0.25, 0.5, 0.75].map((y) => (
        <line key={y} x1="0" x2="420" y1={170 * y} y2={170 * y} stroke="currentColor" opacity="0.06" />
      ))}
      <path d="M0 130 C50 116 92 122 138 104 S225 86 283 75 S360 62 420 48" stroke="currentColor" opacity="0.4" fill="none" />
      <path d="M0 145 C60 136 104 130 154 116 S252 92 310 76 S370 55 420 28" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="310" cy="76" r="4" fill="currentColor" />
      <circle cx="310" cy="76" r="11" stroke="currentColor" opacity="0.35" fill="none" />
      <text x="222" y="30" fill="currentColor" fontSize="10" fontFamily="monospace" fontWeight="700">
        {getIdeaCategory(idea).toUpperCase()} SIGNAL
      </text>
    </svg>
  );
}

function CardsPreview({ target, history }: { target: string; history: number[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="flex aspect-[1200/630] flex-col justify-between rounded-md border border-white/8 bg-black/30 p-2"
        >
          <span className="truncate font-mono text-[9px] text-text-tertiary">
            {index === 0 ? target : `idea-${index + 1}.preview`}
          </span>
          <div className="flex items-end justify-between gap-2 text-white">
            <Sparkline data={history.slice(Math.max(0, index), history.length - 3 + index)} className="h-5 w-14" />
            <span className="font-mono text-[11px] font-bold">+{12 + index * 9}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PortfolioPreview({ target, tags }: { target: string; tags: string[] }) {
  const rows = [target, ...tags, "maintainer fit"].slice(0, 5);
  return (
    <div className="flex flex-col gap-1.5 font-mono text-[10px]">
      {rows.map((row, index) => (
        <div
          key={`${row}-${index}`}
          className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-white/6 py-1.5 last:border-b-0"
        >
          <span className="truncate text-text-secondary">{row}</span>
          <span className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((dot) => (
              <span
                key={dot}
                className={cn(
                  "h-2 w-1.5 rounded-[1px]",
                  dot <= 5 - (index % 3) ? "bg-white/85" : "bg-white/10",
                )}
              />
            ))}
          </span>
          <span className="w-10 text-right font-semibold text-text-primary">
            +{42 - index * 7}%
          </span>
        </div>
      ))}
    </div>
  );
}

function DiffPreview({ idea }: { idea: PublicIdea }) {
  const shortTitle = idea.title.length > 48 ? `${idea.title.slice(0, 48)}...` : idea.title;
  return (
    <div className="font-mono text-[10.5px] leading-relaxed">
      <div className="text-text-tertiary"># concept.md</div>
      <div className="-mx-4 bg-down/10 px-4 text-red-200">- vague builder request</div>
      <div className="-mx-4 bg-functional/10 px-4 text-green-100">+ {shortTitle}</div>
      <div className="mt-2 text-text-tertiary">## why now</div>
      <div className="-mx-4 bg-functional/10 px-4 text-green-100">+ {idea.pitch.slice(0, 96)}</div>
      <div className="mt-2 text-text-secondary">ready for prototype review</div>
    </div>
  );
}

function SwipePreview({ idea }: { idea: PublicIdea }) {
  const labels = [getIdeaCategory(idea), "Long", "Build"];
  return (
    <div className="flex h-[150px] items-center justify-center gap-3">
      {[-1, 0, 1].map((offset) => (
        <div
          key={offset}
          className={cn(
            "flex flex-col justify-between rounded-lg border bg-black/35 p-3",
            offset === 0 ? "h-36 w-28 border-white/16 opacity-100" : "h-28 w-20 border-white/8 opacity-55",
          )}
          style={{ transform: `rotate(${offset * 4}deg)` }}
        >
          <span className="font-mono text-[8px] text-text-tertiary">{labels[offset + 1]}</span>
          <Sparkline data={getIdeaHistory(idea, 80).slice(0, 9)} className="h-8 w-full text-white" />
          <span className="flex justify-between font-mono text-[8px] text-text-tertiary">
            <span>pass</span>
            <span>back</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
