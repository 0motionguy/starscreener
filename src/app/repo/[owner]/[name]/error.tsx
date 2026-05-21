"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function RepoDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[/repo/[owner]/[name]]", error);
  }, [error]);
  return (
    <div style={{ padding: "60px 22px", maxWidth: 720, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head">
          <h1 className="card-title"><span style={{ color: "var(--down)" }}>●</span> <b>Repo detail is rebuilding</b></h1>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ color: "var(--fg-muted)", fontSize: 13, margin: 0 }}>This repo&apos;s detail surface threw. The trending feed is still live.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => reset()} className="btn primary">Retry</button>
            <Link href="/" className="btn ghost">Back to trending</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
