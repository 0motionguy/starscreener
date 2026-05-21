"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function CompareError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[/tools/compare]", error);
  }, [error]);
  return (
    <div style={{ padding: "60px 22px", maxWidth: 720, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head">
          <h1 className="card-title"><span style={{ color: "var(--down)" }}>●</span> <b>Compare view is rebuilding</b></h1>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ color: "var(--fg-muted)", fontSize: 13, margin: 0 }}>One of the repos in this comparison failed to load.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => reset()} className="btn primary">Retry</button>
            <Link href="/tools" className="btn ghost">Tools hub</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
