// V2 design-system primitive — operator-grade mono caption.
// Pattern: <MonoLabel index="01" name="DISCOVER" hint="04.27" />
//   →  // 01 · DISCOVER · 04.27
//
// Or pass `text` for free-form: <MonoLabel text="// SYSTEM SAYS" />

type MonoLabelProps = {
  text?: string;
  index?: string | number;
  name?: string;
  hint?: string;
  tone?: "muted" | "ink" | "accent";
  prefix?: string;
  separator?: string;
  className?: string;
};

const TONE_COLOR: Record<NonNullable<MonoLabelProps["tone"]>, string> = {
  muted: "var(--v2-ink-400)",
  ink: "var(--v2-ink-200)",
  accent: "var(--v2-acc)",
};

export function MonoLabel({
  text,
  index,
  name,
  hint,
  tone = "ink",
  prefix = "//",
  separator = "·",
  className = "",
}: MonoLabelProps) {
  const composed =
    text ??
    [prefix, index, name, hint]
      .filter((part) => part !== undefined && part !== null && part !== "")
      .join(` ${separator} `)
      .replace(`${prefix} ${separator}`, prefix);

  return (
    <span
      className={`v2-mono text-[11px] ${className}`.trim()}
      style={{ color: TONE_COLOR[tone] }}
    >
      {composed}
    </span>
  );
}
