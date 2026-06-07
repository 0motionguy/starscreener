import Link from "next/link";

// Marketing page — content is the deterministic scoring spec. Changes only
// when the trend pipeline rolls a version bump. ISR at 1h is appropriate.
export const revalidate = 3600;

export const metadata = {
  title: "Methodology — TrendingRepo",
  description:
    "How TrendingRepo ranks repos. Deterministic, inspectable trend score: star delta, cross-source mentions, engagement composite, momentum decay, category baseline. Every weight and constant lives here.",
  alternates: { canonical: "/methodology" },
};

// Inputs feeding the 24h trend score. Weights are the live constants used by
// the pipeline — keep them in sync with the worker's scoring config. Treat
// this page as the public spec; reviewers grep here when a score looks off.
const SCORE_INPUTS: ReadonlyArray<{
  label: string;
  weight: string;
  detail: string;
}> = [
  {
    label: "Star delta",
    weight: "1.0×",
    detail:
      "Stars gained in the last 24h. The primary signal — momentum on the canonical platform.",
  },
  {
    label: "Cross-source mentions",
    weight: "0.6× / source",
    detail:
      "Count of distinct discussions on Hacker News, Bluesky, Lobsters, dev.to, and ProductHunt. Multiple sources stack — three or more active platforms talking is the breakout signal.",
  },
  {
    label: "Engagement composite",
    weight: "0.3×",
    detail:
      "Combined score of comments, upvotes, and retweets per mention. A mention with 200 comments outranks a mention with 2.",
  },
  {
    label: "Momentum decay",
    weight: "exponential",
    detail:
      "A star burst 1h ago counts more than one 23h ago. The half-life is 6h — we are scoring acceleration, not history.",
  },
  {
    label: "Category baseline",
    weight: "normalized",
    detail:
      "Each category (devtools, AI, frontend, infra…) has its own median. Raw scores are normalized against that median — otherwise everything in AI would look like it's trending.",
  },
];

// Source poll cadences. Real schedules from .github/workflows/. If a source
// is missing here it means we don't track it yet — be honest in this list.
const SOURCE_SCHEDULE: ReadonlyArray<{
  source: string;
  cadence: string;
}> = [
  { source: "GitHub stars / metadata", cadence: "every 20 min" },
  { source: "Hacker News", cadence: "every 6h" },
  { source: "Bluesky", cadence: "every 8h" },
  { source: "Lobsters", cadence: "every 6h" },
  { source: "ProductHunt", cadence: "every 12h" },
  { source: "X / Twitter", cadence: "every 8h" },
  { source: "dev.to", cadence: "every 24h" },
  { source: "arXiv", cadence: "every 24h" },
  { source: "Hugging Face", cadence: "every 24h" },
];

export default function MethodologyPage() {
  return (
    <main className="main" data-route="methodology">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">
            Scoring transparency <span className="dot">·</span> v1.0
          </div>
          <h1 className="page-title">How we rank repos.</h1>
          <p className="page-sub">
            TrendingRepo&apos;s trend score is deterministic and inspectable.
            Every input, weight, and decay constant lives in this document. No
            secret sauce. The pipeline is open source — link at the bottom.
          </p>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gap: 32,
          maxWidth: 820,
          padding: "8px 0 32px",
        }}
      >
        {/* ── Inputs ──────────────────────────────────────────────────── */}
        <section aria-labelledby="m-inputs">
          <h2
            id="m-inputs"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
              margin: "0 0 12px",
            }}
          >
            {"// Inputs · 24h window"}
          </h2>
          <ul
            style={{
              display: "grid",
              gap: 10,
              margin: 0,
              padding: 0,
              listStyle: "none",
            }}
          >
            {SCORE_INPUTS.map((input) => (
              <li
                key={input.label}
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--r-1)",
                  background: "var(--surface)",
                  padding: "12px 14px",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "4px 16px",
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    color: "var(--fg-bright)",
                    fontSize: 14.5,
                    fontWeight: 500,
                  }}
                >
                  {input.label}
                </span>
                <span
                  className="mono"
                  style={{
                    color: "var(--accent)",
                    fontSize: 12.5,
                    letterSpacing: "0.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {input.weight}
                </span>
                <p
                  style={{
                    gridColumn: "1 / -1",
                    color: "var(--fg-muted)",
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    margin: 0,
                  }}
                >
                  {input.detail}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <hr
          style={{
            border: 0,
            borderTop: "1px solid var(--border-subtle)",
            margin: 0,
          }}
        />

        {/* ── Breakout threshold ─────────────────────────────────────── */}
        <section aria-labelledby="m-breakout">
          <h2
            id="m-breakout"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
              margin: "0 0 12px",
            }}
          >
            {"// What goes into a breakout"}
          </h2>
          <p
            style={{
              color: "var(--fg-muted)",
              fontSize: 14.5,
              lineHeight: 1.65,
              margin: "0 0 12px",
            }}
          >
            A repo earns the <strong style={{ color: "var(--accent)" }}>BREAKOUT</strong> tag
            when its 24h score lands more than 3× over its 7-day rolling median{" "}
            <em>and</em> at least three distinct sources are talking about it
            inside the window. Both conditions matter:
          </p>
          <ul
            style={{
              display: "grid",
              gap: 8,
              margin: 0,
              padding: "0 0 0 4px",
              listStyle: "none",
              color: "var(--fg-muted)",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {[
              "The 3× threshold cuts noise. Normal day-to-day variance sits below 2×.",
              "The 3-source rule kills single-platform amplification. One viral discussion isn't a trend.",
              "Both gates close on bot spikes — our per-source anomaly detector drops them before they reach the score.",
            ].map((line) => (
              <li
                key={line}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    color: "var(--accent)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    marginTop: 2,
                    flexShrink: 0,
                  }}
                >
                  →
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <hr
          style={{
            border: 0,
            borderTop: "1px solid var(--border-subtle)",
            margin: 0,
          }}
        />

        {/* ── Exclusions ─────────────────────────────────────────────── */}
        <section aria-labelledby="m-exclude">
          <h2
            id="m-exclude"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
              margin: "0 0 12px",
            }}
          >
            {"// What we exclude"}
          </h2>
          <ul
            style={{
              display: "grid",
              gap: 8,
              margin: 0,
              padding: 0,
              listStyle: "none",
              color: "var(--fg-muted)",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {[
              "Star count alone — old, popular repos would dominate forever.",
              "Single-source spikes that look bot-like (per-source anomaly detection drops them before scoring).",
              "Repos archived or marked disabled on GitHub.",
              "Forks of currently-trending repos — the original gets the credit.",
              "Self-promotion loops where the maintainer is also the only mentioner.",
            ].map((line) => (
              <li
                key={line}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    color: "var(--fg-faint)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    marginTop: 2,
                    flexShrink: 0,
                  }}
                >
                  ×
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <hr
          style={{
            border: 0,
            borderTop: "1px solid var(--border-subtle)",
            margin: 0,
          }}
        />

        {/* ── Refresh cadence ────────────────────────────────────────── */}
        <section aria-labelledby="m-cadence">
          <h2
            id="m-cadence"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
              margin: "0 0 12px",
            }}
          >
            {"// Refresh cadence"}
          </h2>
          <p
            style={{
              color: "var(--fg-muted)",
              fontSize: 14.5,
              lineHeight: 1.65,
              margin: "0 0 14px",
            }}
          >
            The trending pipeline runs every 20 minutes (UTC :07, :27, :47).
            Mention pipelines run on per-source schedules — each source has its
            own rate limits and we respect them:
          </p>
          <div
            style={{
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--r-1)",
              background: "var(--surface)",
              overflow: "hidden",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13.5,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border-subtle)",
                    background: "var(--surface-2)",
                  }}
                >
                  <th
                    scope="col"
                    style={{
                      textAlign: "left",
                      padding: "10px 14px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--fg-faint)",
                      fontWeight: 500,
                    }}
                  >
                    Source
                  </th>
                  <th
                    scope="col"
                    style={{
                      textAlign: "right",
                      padding: "10px 14px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--fg-faint)",
                      fontWeight: 500,
                    }}
                  >
                    Poll cadence
                  </th>
                </tr>
              </thead>
              <tbody>
                {SOURCE_SCHEDULE.map((row, i) => (
                  <tr
                    key={row.source}
                    style={{
                      borderBottom:
                        i === SOURCE_SCHEDULE.length - 1
                          ? "none"
                          : "1px solid var(--border-subtle)",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px 14px",
                        color: "var(--fg)",
                      }}
                    >
                      {row.source}
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: "10px 14px",
                        textAlign: "right",
                        color: "var(--accent)",
                        fontVariantNumeric: "tabular-nums",
                        fontSize: 12.5,
                      }}
                    >
                      {row.cadence}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <hr
          style={{
            border: 0,
            borderTop: "1px solid var(--border-subtle)",
            margin: 0,
          }}
        />

        {/* ── Inspect the data ───────────────────────────────────────── */}
        <section aria-labelledby="m-inspect">
          <h2
            id="m-inspect"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
              margin: "0 0 12px",
            }}
          >
            {"// Inspect the data"}
          </h2>
          <p
            style={{
              color: "var(--fg-muted)",
              fontSize: 14.5,
              lineHeight: 1.65,
              margin: "0 0 12px",
            }}
          >
            Every repo&apos;s detail page (e.g.{" "}
            <Link
              href="/repo/vercel/next.js"
              style={{
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              /repo/vercel/next.js
            </Link>
            ) shows the raw signal breakdown — per-source mention counts, star
            deltas across windows, and the live trend score with every weighted
            input visible. The pipeline source is on GitHub:
          </p>
          <p style={{ margin: 0 }}>
            <a
              href="https://github.com/0motionguy/starscreener"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              github.com/0motionguy/starscreener →
            </a>
          </p>
        </section>

        {/* ── Footer meta ─────────────────────────────────────────────── */}
        <footer
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "space-between",
            paddingTop: 8,
            borderTop: "1px solid var(--border-subtle)",
            color: "var(--fg-faint)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          <span>Methodology v1.0</span>
          <span>Last updated 2026-05-21</span>
          <Link
            href="/contact"
            style={{
              color: "var(--accent)",
              textDecoration: "none",
            }}
          >
            Questions? Contact us →
          </Link>
        </footer>
      </div>
    </main>
  );
}
