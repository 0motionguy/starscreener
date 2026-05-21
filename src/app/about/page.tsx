import Link from "next/link";

// Marketing page — content changes rarely. ISR every hour gives us fresh deploys
// on copy edits without hammering the build pipeline. The page is static (no
// per-request data fetching), so the 1h revalidate is conservative.
export const revalidate = 3600;

export const metadata = {
  title: "About — TrendingRepo",
  description:
    "TrendingRepo is a trend radar for open source. We surface breakout repositories, MCP servers, and Claude skills the moment they ship by ranking cross-source agreement across GitHub, Reddit, Hacker News, Bluesky, ProductHunt, dev.to, and arXiv.",
};

export default function AboutPage() {
  return (
    <main className="main" data-route="about">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">
            About <span className="dot">·</span> Our story
          </div>
          <h1 className="page-title">We are a trend radar for open source.</h1>
          <p className="page-sub">
            Our mission is to surface breakout open-source repositories, MCP
            servers, and Claude skills the moment they ship. We track signals
            from GitHub, Reddit, Hacker News, ProductHunt, Bluesky, dev.to, and
            arXiv, and we rank them by cross-source agreement so you can see
            what is moving before it trends.
          </p>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gap: 28,
          maxWidth: 760,
          padding: "8px 0 32px",
        }}
      >
        <section>
          <h2
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
              margin: "0 0 10px",
            }}
          >
            {"// What we do"}
          </h2>
          <p
            style={{
              color: "var(--fg-muted)",
              fontSize: 15,
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            TrendingRepo is the trend desk for open source. We ingest signals
            from seven public sources every few hours, normalize them against
            per-category baselines, and rank repositories by cross-source
            agreement. The result is a live momentum index that catches
            breakouts hours before they hit the front page — and a deterministic
            score you can inspect, line by line, on every repo&apos;s detail page.
          </p>
        </section>

        <hr
          style={{
            border: 0,
            borderTop: "1px solid var(--border-subtle)",
            margin: 0,
          }}
        />

        <section>
          <h2
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
              margin: "0 0 10px",
            }}
          >
            {"// Why we built it"}
          </h2>
          <p
            style={{
              color: "var(--fg-muted)",
              fontSize: 15,
              lineHeight: 1.65,
              margin: "0 0 12px",
            }}
          >
            Star counts are a lagging indicator. By the time a repository hits
            10k stars, the operators who would have built on top of it have
            already moved on to the next thing. We wanted a surface that
            answered a sharper question: <em>what crossed a meaningful
            threshold in the last 24 hours?</em>
          </p>
          <p
            style={{
              color: "var(--fg-muted)",
              fontSize: 15,
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            Single-source aggregators (Hacker News, Reddit, ProductHunt) each
            answer one slice of that question. We answer it across all of them
            at once, with anomaly detection that drops bot spikes and a category
            baseline that prevents &ldquo;everything in AI is trending&rdquo;
            distortion.
          </p>
        </section>

        <hr
          style={{
            border: 0,
            borderTop: "1px solid var(--border-subtle)",
            margin: 0,
          }}
        />

        <section>
          <h2
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
              margin: "0 0 10px",
            }}
          >
            {"// The team"}
          </h2>
          <p
            style={{
              color: "var(--fg-muted)",
              fontSize: 15,
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            TrendingRepo is built and maintained by an independent founder
            team. The credentials behind the project: a decade of experience
            shipping production systems for ingestion pipelines, search
            infrastructure, and developer-facing APIs. We treat this site as a
            research tool first; the leadership commitment is to keep the
            front page free of paywalls and the API public.
          </p>
        </section>

        <hr
          style={{
            border: 0,
            borderTop: "1px solid var(--border-subtle)",
            margin: 0,
          }}
        />

        <section>
          <h2
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
              margin: "0 0 10px",
            }}
          >
            {"// What we publish"}
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
            {[
              "A live momentum index across 7+ data sources, refreshed every few hours.",
              "A public REST API and a Portal v0.1 manifest exposing the same tools over JSON-RPC 2.0.",
              "A zero-dependency CLI (Node 18+) for terminal use, and an MCP server for Claude or any agent.",
              "An llms.txt index for AI crawlers, with a full variant covering the entire site map.",
            ].map((item) => (
              <li
                key={item}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  color: "var(--fg-muted)",
                  fontSize: 14.5,
                  lineHeight: 1.6,
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
                <span>{item}</span>
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

        <section
          aria-labelledby="about-cta"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            paddingTop: 8,
          }}
        >
          <h2
            id="about-cta"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
              margin: 0,
              flexBasis: "100%",
            }}
          >
            {"// Get started"}
          </h2>
          <Link
            href="/"
            className="btn primary"
            style={{ textDecoration: "none" }}
          >
            See the trends →
          </Link>
          <Link
            href="/sign-up"
            className="btn"
            style={{ textDecoration: "none" }}
          >
            Create an account
          </Link>
          <Link
            href="/methodology"
            className="btn"
            style={{ textDecoration: "none" }}
          >
            How we rank
          </Link>
        </section>
      </div>
    </main>
  );
}
