// BuildSignalsTable - table of detected repo signals.

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
  repoFullName: string;
}

export function BuildSignalsTable({
  signals,
  repoFullName,
}: BuildSignalsTableProps) {
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
              <span
                className={`sig-dot${DOT_CLASS[s.kind] ? ` ${DOT_CLASS[s.kind]}` : ""}`}
              />
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
