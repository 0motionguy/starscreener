import Link from "next/link";

interface AccountWatchlistPreviewProps {
  repos: string[];
  expanded?: boolean;
}

export function AccountWatchlistPreview({
  repos,
  expanded = false,
}: AccountWatchlistPreviewProps) {
  const visible = expanded ? repos : repos.slice(0, 6);

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Watchlist</b> · private repo radar
        </h2>
        <span className="grow" />
        <span className="tag">{repos.length.toLocaleString()} repos</span>
      </div>
      <div style={{ padding: 14, display: "grid", gap: 8 }}>
        {visible.length === 0 ? (
          <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 12 }}>
            No private watchlist repos yet.
          </p>
        ) : (
          visible.map((fullName) => {
            const [owner, name] = fullName.split("/");
            const href =
              owner && name
                ? `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
                : "/account";
            return (
              <Link
                key={fullName}
                href={href}
                prefetch={false}
                className="repo-link"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "9px 10px",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--r-1)",
                  background: "var(--surface-2)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
              >
                <span>{fullName}</span>
                <span style={{ color: "var(--accent)" }}>OPEN</span>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
