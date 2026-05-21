// PvIdeas — ideas board preview: NEW banner + 3 idea rows + pipeline footer.
// Pixel-faithful to index.html:689-717.
import { Lightbulb } from "@/lib/icons";

export function PvIdeas() {
  const IDEAS = [
    { title: "Hosted MCP dashboard", status: "OPEN", statusVariant: "up" as const },
    { title: "RAG self-host leaderboard", status: "OPEN", statusVariant: "up" as const },
    {
      title: "Prompt-regression CI",
      status: "CLAIMED",
      statusVariant: "accent" as const,
    },
  ];

  return (
    <div
      className="scrn-preview pv-ideas"
      style={{
        background: "var(--surface)",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: "6px 8px",
          background: "var(--accent-soft)",
          border: "1px solid rgba(255,107,53,0.32)",
          borderRadius: 3,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--accent)",
            letterSpacing: "0.14em",
            fontWeight: 600,
          }}
        >
          NEW · BUILDER LAYER
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--accent)",
            fontWeight: 600,
          }}
        >
          +12 / 24h
        </span>
      </div>
      {IDEAS.map((i, idx) => {
        const statusColor =
          i.statusVariant === "up" ? "var(--up)" : "var(--accent)";
        const statusBg =
          i.statusVariant === "up"
            ? "rgba(74,222,128,0.12)"
            : "rgba(255,107,53,0.12)";
        return (
          <div
            key={i.title}
            style={{
              display: "flex",
              gap: 5,
              alignItems: "center",
              padding: "6px 8px",
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
              borderLeft: idx === 0 ? "2px solid var(--accent)" : undefined,
              borderRadius: 3,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                background: "var(--surface-3)",
                borderRadius: 3,
                display: "grid",
                placeItems: "center",
                color: "var(--accent)",
                fontSize: 9,
              }}
            >
              <Lightbulb size={9} strokeWidth={2} aria-hidden="true" />
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9.5,
                color: "var(--fg-bright)",
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {i.title}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8.5,
                padding: "1px 5px",
                background: statusBg,
                color: statusColor,
                borderRadius: 2,
                fontWeight: 600,
              }}
            >
              {i.status}
            </span>
          </div>
        );
      })}
      <div
        style={{
          flex: 1,
          background:
            "linear-gradient(135deg, rgba(255,107,53,0.10), transparent)",
          border: "1px solid rgba(255,107,53,0.20)",
          borderRadius: 3,
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--accent)",
            letterSpacing: "0.10em",
          }}
        >
          ▌ PIPELINE
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            color: "var(--fg-bright)",
          }}
        >
          <span>14,823</span>
          <span style={{ color: "var(--fg-faint)" }}>→</span>
          <span>98K</span>
          <span style={{ color: "var(--fg-faint)" }}>→</span>
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>387</span>
          <span style={{ color: "var(--fg-faint)" }}>→</span>
          <span style={{ color: "var(--up)", fontWeight: 600 }}>62</span>
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8.5,
            color: "var(--fg-muted)",
          }}
        >
          repos · signals · ideas · claimed
        </span>
      </div>
    </div>
  );
}
