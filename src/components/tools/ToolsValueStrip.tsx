export function ToolsValueStrip() {
  return (
    <section
      style={{
        marginTop: 16,
        padding: "12px 14px",
        border: "1px solid var(--border-subtle)",
        background: "var(--surface)",
        color: "var(--fg-muted)",
        fontSize: 12,
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span>Tool routes use the same data spine as the rebuilt desk.</span>
      <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
        no archived UI imports
      </span>
    </section>
  );
}
