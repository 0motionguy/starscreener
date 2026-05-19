// Placeholder home — Phase 0 foundation. Phase 1A replaces this with the
// full Trending hub. Renders inside the shell layout (sidebar + topbar +
// ticker + main + statusbar grid).

import { refreshTrendingFromStore, getTrending, getLastFetchedAt } from "@/lib/trending";
import { classifyFreshness } from "@/lib/news/freshness";

export const revalidate = 1800;

export const metadata = {
  title: "TrendingRepo — rebuild in progress",
  robots: { index: false, follow: false },
};

export default async function HomePage() {
  await refreshTrendingFromStore();
  const repos = getTrending("past_24_hours", "All");
  const repoCount = repos.length;
  const fetchedAt = getLastFetchedAt() || null;
  const verdict = fetchedAt ? classifyFreshness("repos", fetchedAt) : null;

  return (
    <div style={{ padding: "16px 22px 32px", maxWidth: 1280 }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <span className="live-dot" /> <b>PHASE 0</b> · foundation shell wired · data spine alive
          </div>
          <h1 className="page-title">TrendingRepo — Phase 1A pending</h1>
          <p className="page-sub">
            UI v4 dismantled · shell.css + shell.js live · Sidebar, Topbar, Ticker, Statusbar mounted ·
            phase-by-phase rebuild in progress. Phase 1A: Trending hub.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <h2 className="card-title">
            ▸ <b>Data spine probe</b>
          </h2>
        </div>
        <div className="card-body">
          <dl style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "8px 16px", margin: 0 }}>
            <dt style={{ color: "var(--fg-faint)" }}>repos cached</dt>
            <dd style={{ margin: 0, fontFamily: "var(--font-mono)" }}>{repoCount}</dd>
            <dt style={{ color: "var(--fg-faint)" }}>fetchedAt</dt>
            <dd style={{ margin: 0, fontFamily: "var(--font-mono)" }}>{fetchedAt ?? "—"}</dd>
            <dt style={{ color: "var(--fg-faint)" }}>freshness</dt>
            <dd style={{ margin: 0, fontFamily: "var(--font-mono)" }}>
              {verdict ? `${verdict.status} · ${verdict.ageLabel}` : "—"}
            </dd>
          </dl>
          <p style={{ color: "var(--fg-muted)", fontSize: 12, marginTop: 16 }}>
            See{" "}
            <code style={{ color: "var(--accent)" }}>docs/UI-REBUILD-CONTRACT.md</code> and{" "}
            <code style={{ color: "var(--accent)" }}>docs/HANDOVER-2026-05-19-REBUILD.md</code> for the
            surfaces preserved across the teardown.
          </p>
        </div>
      </div>
    </div>
  );
}
