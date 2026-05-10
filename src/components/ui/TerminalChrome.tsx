import type { JSX, ReactNode } from "react";

export type MonoTone = "muted" | "ink" | "accent";

const MONO_TONE_COLOR: Record<MonoTone, string> = {
  muted: "var(--v2-ink-400)",
  ink: "var(--v2-ink-200)",
  accent: "var(--v2-acc)",
};

export function TerminalChromeBar({
  label,
  status,
  live = false,
  className = "",
}: {
  label: ReactNode;
  status?: ReactNode;
  live?: boolean;
  className?: string;
}): JSX.Element {
  return (
    <div className={`v2-term-bar ${className}`.trim()}>
      <span aria-hidden className="flex items-center gap-1.5">
        <span
          className={`block h-1.5 w-1.5 rounded-full ${live ? "v2-live-dot" : ""}`}
          style={live ? undefined : { background: "var(--v2-line-300)" }}
        />
        <span
          className="block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--v2-line-200)" }}
        />
        <span
          className="block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--v2-line-200)" }}
        />
      </span>
      <span className="flex-1 truncate" style={{ color: "var(--v2-ink-200)" }}>
        {label}
      </span>
      {status ? (
        <span className="v2-stat shrink-0" style={{ color: "var(--v2-ink-300)" }}>
          {status}
        </span>
      ) : null}
    </div>
  );
}

export function MonoCaption({
  index,
  name,
  hint,
  tone = "ink",
}: {
  index?: string | number;
  name?: string;
  hint?: string;
  tone?: MonoTone;
}): JSX.Element {
  const composed = `// ${[index, name, hint]
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join(" \u00b7 ")}`;

  return (
    <span className="v2-mono text-[11px]" style={{ color: MONO_TONE_COLOR[tone] }}>
      {composed}
    </span>
  );
}

function barcodeRandom(seed: number, index: number): number {
  let t = (seed * (index + 1) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function BarcodeStrip({
  count = 64,
  height = 24,
  seed = 220,
}: {
  count?: number;
  height?: number;
  seed?: number;
}): JSX.Element {
  const bars = Array.from({ length: count }, (_, index) => {
    const r = barcodeRandom(seed, index);
    return {
      key: index,
      width: 1 + Math.floor(r * 4),
      opacity: 0.25 + r * 0.55,
    };
  });

  return (
    <div aria-hidden className="flex items-stretch gap-[2px]" style={{ height }}>
      {bars.map((bar) => (
        <span
          key={bar.key}
          style={{
            width: bar.width,
            background: "var(--v2-ink-200)",
            opacity: bar.opacity,
          }}
        />
      ))}
    </div>
  );
}
