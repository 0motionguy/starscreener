import type { ReactElement } from "react";

interface WhyBadgeProps {
  text: string;
  signal?: string;
  className?: string;
}

export function WhyBadge({ text, signal, className }: WhyBadgeProps): ReactElement {
  return (
    <span
      className={className}
      title={text}
      aria-label={signal ? `Why trending (${signal}): ${text}` : `Why trending: ${text}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px",
        border: "1px solid var(--v4-line-200, var(--v3-line-200))",
        background: "var(--v4-bg-025, rgba(245,110,15,0.08))",
        color: "var(--v4-ink-200, var(--v3-ink-200))",
        fontSize: 11,
        lineHeight: 1.2,
        borderRadius: 999,
        maxWidth: "100%",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: "var(--v4-acc, var(--acc))",
          flexShrink: 0,
        }}
      />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {text}
      </span>
    </span>
  );
}

export default WhyBadge;

