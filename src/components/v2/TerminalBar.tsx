// V2 design-system primitive — terminal-bar header for cards.
// Usage:
//   <TerminalBar label="// REPOS · LIVE" status="14ms" live />

type TerminalBarProps = {
  label: string;
  status?: string;
  live?: boolean;
  className?: string;
};

export function TerminalBar({ label, status, live = false, className = "" }: TerminalBarProps) {
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
