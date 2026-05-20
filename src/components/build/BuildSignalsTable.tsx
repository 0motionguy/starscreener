// BuildSignalsTable — .signal-table grid with up to 5 rows of detected
// signals: README updated / Release published / PR merged / Star spike /
// Contributor joined. Each row has a type dot (color-coded by kind),
// summary, detected age, suggested angle, strength chip, and a Create
// update button that scrolls the page to the editor (anchor #draft-editor)
// with the signal id in the URL hash.

import Link from "next/link";

import type { BuildSignal, BuildSignalKind } from "./build-signals";

const DOT_CLASS: Record<BuildSignalKind, string> = {
  readme: "",
  release: "green",
  pr: "blue",
  stars: "warn",
  contributor: "green",
};

interface BuildSignalsTableProps {
  signals: BuildSignal[];
  /** Repo full name carried into the draft-editor anchor for context. */
  repoFullName: string;
}

export function BuildSignalsTable({
  signals,
  repoFullName,
}: BuildSignalsTableProps) {
  if (signals.length === 0) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>Detected repo signals</h2>
          <span className="meta">nothing yet</span>
        </div>
        <div className="empty-state">
          <h3>No publishable repo signals found yet.</h3>
          <p>
            TrendingRepo will suggest updates when releases, PRs, stars,
            milestones, contributors, or documentation changes appear.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Detected repo signals</h2>
        <span className="meta">what happened</span>
      </div>
      <div className="signal-table">
        {signals.map((s, i) => (
          <div className="signal-row" key={s.id}>
            <div className="signal-type">
              <span className={`sig-dot${DOT_CLASS[s.kind] ? ` ${DOT_CLASS[s.kind]}` : ""}`} />
              <b>{s.title}</b>
            </div>
            <div className="signal-main">
              <p>{s.summary}</p>
              <span>
                Detected {s.detectedAge}, suggested angle: {s.angle}
              </span>
            </div>
            <span className={`strength ${s.strength}`}>
              {s.strength === "strong"
                ? "strong"
                : s.strength === "med"
                  ? "medium"
                  : "low"}
            </span>
            <div className="signal-actions">
              <Link
                className={i === 0 ? "tiny-btn primary" : "tiny-btn"}
                href={`/build?repo=${encodeURIComponent(repoFullName)}&review=${s.kind}#card-${s.kind}`}
                data-review={s.kind}
                scroll={false}
              >
                Create update
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
