// PvMoney — funding tape preview. Pixel-faithful to index.html:580-598.
export function PvMoney() {
  const ROUNDS = [
    { name: "Cursor", round: "SER C", amount: "$900M" },
    { name: "Mistral", round: "SER B", amount: "$640M" },
  ];

  return (
    <div
      className="scrn-preview pv-money"
      style={{
        background: "var(--surface)",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {ROUNDS.map((r) => (
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
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--fg-bright)",
            }}
          >
            {r.name}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: "var(--cyan)",
              background: "rgba(77,212,255,0.08)",
              padding: "1px 5px",
              borderRadius: 1,
            }}
          >
            {r.round}
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--accent)",
              fontWeight: 600,
            }}
          >
            {r.amount}
          </span>
        </div>
      ))}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 2,
          flex: 1,
        }}
      >
        <div
          style={{
            background:
              "linear-gradient(135deg, var(--surface-2), var(--accent-wash))",
            borderRadius: 2,
          }}
        />
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--accent-soft)",
            borderRadius: 2,
          }}
        />
        <div style={{ background: "var(--surface-2)", borderRadius: 2 }} />
      </div>
      <div
        style={{
          height: 30,
          padding: 4,
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 3,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 200 24"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,22 Q30,18 50,12 Q80,8 110,5 Q140,3 200,2"
            stroke="var(--accent)"
            strokeWidth="1.4"
            fill="none"
          />
        </svg>
      </div>
    </div>
  );
}
