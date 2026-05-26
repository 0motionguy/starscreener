// PvBuild — build workflow preview: NEW banner + 3 repo rows + connect CTA.
// Pixel-faithful to index.html:732-756.
import type { ReactNode } from "react";
import { Icon } from "@/lib/icons";

export function PvBuild() {
  const REPOS: Array<{
    name: string;
    note: ReactNode;
    color: string;
  }> = [
    { name: "vercel/ai-sdk", note: "+ release v6.2", color: "var(--up)" },
    {
      name: "cline/cline",
      note: "+ 14 PRs merged",
      color: "var(--accent)",
    },
    {
      name: "crewAIInc/crewAI",
      note: (
        <>
          <Icon
            name="star"
            size={9}
            style={{ verticalAlign: "-1px", marginRight: 3 }}
          />
          +312 24h
        </>
      ),
      color: "var(--up)",
    },
  ];

  return (
    <div
      className="scrn-preview pv-build"
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
            color: "var(--up)",
            fontWeight: 600,
          }}
        >
          ●  live
        </span>
      </div>
      {REPOS.map((r) => (
        <div
          key={r.name}
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            padding: "7px 8px",
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 3,
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              background: "#1a1a1a",
              border: "1px solid var(--border-subtle)",
              borderRadius: 3,
              display: "grid",
              placeItems: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "#fff",
            }}
          >
            ⌗
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
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: r.color,
            }}
          >
            {r.note}
          </span>
        </div>
      ))}
      <div
        style={{
          flex: 1,
          background:
            "linear-gradient(135deg, rgba(74,222,128,0.08), transparent)",
          border: "1px solid rgba(74,222,128,0.18)",
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
            color: "var(--up)",
            letterSpacing: "0.10em",
          }}
        >
          ▌ CONNECT REPO · 1-CLICK
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            color: "var(--fg-bright)",
          }}
        >
          Progress → build-in-public posts
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8.5,
            color: "var(--fg-muted)",
          }}
        >
          Releases · PRs · stars · contributors · milestones
        </span>
      </div>
    </div>
  );
}
