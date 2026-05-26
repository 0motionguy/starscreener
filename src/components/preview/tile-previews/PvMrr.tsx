// PvMrr — revenue terminal preview: 3 verified OSS cards + combined-30d
// hero card. Pixel-faithful to index.html:650-673.
import { Icon } from "@/lib/icons";

export function PvMrr() {
  const ROWS = [
    { logo: "G", name: "Gumroad", mrr: "$7.14M" },
    { logo: "S", name: "Stan", mrr: "$3.57M" },
    { logo: "C", name: "Cursor", mrr: "$2.40M" },
  ];

  return (
    <div
      className="scrn-preview pv-mrr"
      style={{
        background: "var(--surface)",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      {ROWS.map((r) => (
        <div
          key={r.name}
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            padding: "5px 8px",
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 3,
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              background: "var(--surface-3)",
              borderRadius: 2,
              display: "grid",
              placeItems: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--up)",
              fontWeight: 600,
            }}
          >
            {r.logo}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--fg-bright)",
            }}
          >
            {r.name}
          </span>
          <Icon
            name="check-circle"
            size={10}
            style={{ color: "var(--up)" }}
          />
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--up)",
              fontWeight: 600,
            }}
          >
            {r.mrr}
          </span>
        </div>
      ))}
      <div
        style={{
          flex: 1,
          background:
            "linear-gradient(135deg, rgba(74,222,128,0.08), transparent)",
          border: "1px solid var(--up-soft)",
          borderRadius: 3,
          padding: 6,
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
            color: "var(--up)",
            letterSpacing: "0.10em",
          }}
        >
          ▌ COMBINED 30d
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 18,
            color: "var(--up)",
            fontWeight: 600,
          }}
        >
          $284.2M
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--fg-muted)",
          }}
        >
          38 tracked OSS matches · TrustMRR verified
        </span>
      </div>
    </div>
  );
}
