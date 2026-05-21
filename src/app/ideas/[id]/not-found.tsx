// /ideas/[id] not-found — idea id doesn't exist.

import Link from "next/link";

export default function IdeaNotFound() {
  return (
    <div style={{ padding: "60px 22px", maxWidth: 720, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head">
          <h1 className="card-title"><span style={{ color: "var(--fg-faint)" }}>●</span> <b>Idea not found</b></h1>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ color: "var(--fg-muted)", fontSize: 13, margin: 0 }}>That idea id doesn&apos;t exist in the board. Could be a stale link or an idea that&apos;s been retired.</p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)", margin: 0, letterSpacing: "0.04em" }}>status · 404 · idea_not_found</p>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/ideas" className="btn primary">Back to idea board</Link>
            <Link href="/" className="btn ghost">Trending</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
