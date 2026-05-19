export function ToolsActivityStrip() {
  return (
    <section
      className="card"
      style={{
        marginTop: 20,
        padding: 14,
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 10,
      }}
    >
      {["charts", "watch", "rank", "submit"].map((label, index) => (
        <div key={label} className="kpi">
          <span className="kpi-label">{label}</span>
          <span className="kpi-value">{index + 1}</span>
          <span className="kpi-delta">tool lane</span>
        </div>
      ))}
    </section>
  );
}
