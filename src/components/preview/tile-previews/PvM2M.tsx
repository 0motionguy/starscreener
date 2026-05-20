// PvM2M — agent-commerce protocol mini-grid + on-chain settlements + token
// tape. Pixel-faithful to index.html:613-635.
export function PvM2M() {
  const PROTOCOLS = [
    { label: "X402", value: "$3.3M" },
    { label: "MCP", value: "62" },
    { label: "A2A", value: "18" },
  ];
  const CHAINS = [
    { label: "▌ BASE", color: "#0052ff", volume: "$2.42M", tx: "12.4K tx" },
    {
      label: "▌ SOLANA",
      color: "#14f195",
      volume: "$890K",
      tx: "4.2K tx",
    },
  ];

  return (
    <div
      className="scrn-preview pv-m2m"
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
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 4,
        }}
      >
        {PROTOCOLS.map((p) => (
          <div
            key={p.label}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 3,
              padding: 5,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: "var(--cyan)",
                letterSpacing: "0.10em",
              }}
            >
              {p.label}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--fg-bright)",
              }}
            >
              {p.value}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          flex: 1,
        }}
      >
        {CHAINS.map((c) => (
          <div
            key={c.label}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 3,
              padding: 6,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: c.color,
                letterSpacing: "0.10em",
              }}
            >
              {c.label}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "var(--fg-bright)",
              }}
            >
              {c.volume}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: "var(--fg-faint)",
              }}
            >
              {c.tx}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          gap: 5,
          alignItems: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
        }}
      >
        <span
          style={{
            color: "var(--up)",
            background: "var(--up-soft)",
            padding: "1px 5px",
            borderRadius: 1,
          }}
        >
          $FET +12.4%
        </span>
        <span
          style={{
            color: "var(--up)",
            background: "var(--up-soft)",
            padding: "1px 5px",
            borderRadius: 1,
          }}
        >
          $AGIX +8.2%
        </span>
        <span
          style={{
            color: "var(--down)",
            background: "rgba(239,68,68,0.08)",
            padding: "1px 5px",
            borderRadius: 1,
          }}
        >
          $VIRTUAL -2.1%
        </span>
      </div>
    </div>
  );
}
