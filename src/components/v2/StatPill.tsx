// V2 design-system primitive — compact stat pill.
// Used inside forecast cards and dense metric grids.

type Tone = "up" | "down" | "brand" | "neutral";

const toneMap: Record<Tone, string> = {
  up: "border-up/30 bg-up/5 text-up",
  down: "border-down/30 bg-down/5 text-down",
  brand: "border-brand/40 bg-brand/10 text-brand",
  neutral: "border-border-primary bg-bg-muted/60 text-text-secondary",
};

interface StatPillProps {
  label: string;
  value: string | number;
  tone?: Tone;
}

export function StatPill({ label, value, tone = "neutral" }: StatPillProps): React.ReactElement {
  return (
    <div className={`rounded-md border ${toneMap[tone]} px-2 py-1.5 text-center`}>
      <div className="font-mono text-[9px] uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-xs font-bold tabular-nums">
        {value}
      </div>
    </div>
  );
}
