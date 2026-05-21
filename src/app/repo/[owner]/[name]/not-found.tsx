// /repo/[owner]/[name] not-found — the repo isn't indexed.

import Link from "next/link";

export default function RepoNotFound() {
  return (
    <div style={{ padding: "60px 22px", maxWidth: 720, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head">
          <h1 className="card-title"><span style={{ color: "var(--fg-faint)" }}>●</span> <b>Repo not indexed</b></h1>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ color: "var(--fg-muted)", fontSize: 13, margin: 0 }}>We haven&apos;t scanned that owner/name yet. It may be private, archived, or below our discovery threshold.</p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)", margin: 0, letterSpacing: "0.04em" }}>status · 404 · repo_not_indexed</p>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/" className="btn primary">Back to trending</Link>
            <Link href="/breakout" className="btn ghost">Breakout watch</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
