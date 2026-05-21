import Link from "next/link";

// Marketing page — static content, ISR at 1h gives us a fresh deploy on copy
// changes without churn. No per-request data.
export const revalidate = 3600;

export const metadata = {
  title: "Contact — TrendingRepo",
  description:
    "Get in touch with the TrendingRepo trend desk. Email hello@trendingrepo.com, file issues on GitHub, reach us on X / Twitter, or submit a repo for review.",
};

// Contact methods — each renders as a row in the contact grid below.
// `href` may be a mailto:, http(s):, or internal route. `external` controls
// the rel/target attributes so internal routes don't get rel="noopener" noise.
const CONTACT_METHODS: ReadonlyArray<{
  label: string;
  href: string;
  display: string;
  hint: string;
  external: boolean;
}> = [
  {
    label: "Email",
    href: "mailto:hello@trendingrepo.com",
    display: "hello@trendingrepo.com",
    hint: "General questions, partnerships, press. We reply within one business day.",
    external: false,
  },
  {
    label: "X / Twitter",
    href: "https://x.com/0motionguy",
    display: "@0motionguy",
    hint: "Public DMs open. Fastest way to flag a missed trend or get a fix in.",
    external: true,
  },
  {
    label: "GitHub issues",
    href: "https://github.com/0motionguy/starscreener/issues",
    display: "github.com/0motionguy/starscreener/issues",
    hint: "Bug reports, missing repos, ranking disputes. Issues are read daily.",
    external: true,
  },
  {
    label: "Submit a repo",
    href: "/drop",
    display: "/drop",
    hint: "Nominate an open-source repo for the trend index. Reviewed within 24h.",
    external: false,
  },
];

export default function ContactPage() {
  return (
    <main className="main" data-route="contact">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">
            Contact <span className="dot">·</span> Get in touch
          </div>
          <h1 className="page-title">Get in touch with the trend desk.</h1>
          <p className="page-sub">
            The fastest way to reach the TrendingRepo team is whichever channel
            you already use. We are an independent founder team — every message
            is read by a person, usually within one business day.
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
              margin: "0 0 12px",
            }}
          >
            {"// Contact methods"}
          </h2>
          <ul
            style={{
              display: "grid",
              gap: 12,
              margin: 0,
              padding: 0,
              listStyle: "none",
            }}
          >
            {CONTACT_METHODS.map((method) => (
              <li
                key={method.label}
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--r-1)",
                  background: "var(--surface)",
                  padding: "14px 16px",
                  display: "grid",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    flexWrap: "wrap",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--fg-faint)",
                      minWidth: 110,
                    }}
                  >
                    {method.label}
                  </span>
                  {method.external ? (
                    <a
                      href={method.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--accent)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 14,
                        textDecoration: "none",
                      }}
                    >
                      {method.display}
                    </a>
                  ) : (
                    <Link
                      href={method.href}
                      style={{
                        color: "var(--accent)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 14,
                        textDecoration: "none",
                      }}
                    >
                      {method.display}
                    </Link>
                  )}
                </div>
                <p
                  style={{
                    color: "var(--fg-muted)",
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    margin: 0,
                  }}
                >
                  {method.hint}
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

        <section aria-labelledby="contact-form">
          <h2
            id="contact-form"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
              margin: "0 0 12px",
            }}
          >
            {"// Send a note"}
          </h2>
          <p
            style={{
              color: "var(--fg-muted)",
              fontSize: 14.5,
              lineHeight: 1.6,
              margin: "0 0 16px",
            }}
          >
            Prefer email? Drop us a line directly. This form composes a mailto:
            link with your subject + message pre-filled — no submission endpoint,
            no tracking, your client sends it.
          </p>
          <form
            action="mailto:hello@trendingrepo.com"
            method="post"
            encType="text/plain"
            style={{
              display: "grid",
              gap: 10,
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--r-1)",
              background: "var(--surface)",
              padding: 16,
            }}
          >
            <label
              style={{
                display: "grid",
                gap: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--fg-faint)",
              }}
            >
              Subject
              <input
                type="text"
                name="subject"
                placeholder="What is this about?"
                required
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-1)",
                  color: "var(--fg)",
                  padding: "9px 12px",
                  fontSize: 14,
                  fontFamily: "var(--font-display)",
                  letterSpacing: "normal",
                  textTransform: "none",
                }}
              />
            </label>
            <label
              style={{
                display: "grid",
                gap: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--fg-faint)",
              }}
            >
              Message
              <textarea
                name="body"
                rows={6}
                placeholder="Tell us what's on your mind."
                required
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-1)",
                  color: "var(--fg)",
                  padding: "10px 12px",
                  fontSize: 14,
                  fontFamily: "var(--font-display)",
                  letterSpacing: "normal",
                  textTransform: "none",
                  resize: "vertical",
                }}
              />
            </label>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <button type="submit" className="btn primary">
                Open in mail client →
              </button>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--fg-faint)",
                }}
              >
                Sends from your email app · no data leaves the page
              </span>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
