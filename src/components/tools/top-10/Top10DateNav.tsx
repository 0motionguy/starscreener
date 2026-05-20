// Top10DateNav — hero strip for /tools/top-10. Shows the active snapshot date
// in large mono, prev/next arrow links that swap `?date=`, and a 7-day pill
// row letting the user jump to any of the last week's snapshots in one click.
//
// All navigation is plain <Link> with prefetch={false}; the page re-renders
// server-side for each date (ISR-cached per query). No client state.

import Link from "next/link";

interface DayPill {
  date: string;
  label: string; // "MON 14"
  isToday: boolean;
  isActive: boolean;
  hasSnapshot: boolean;
}

interface Top10DateNavProps {
  /** Active snapshot date (YYYY-MM-DD) — large mono headline. */
  activeDate: string;
  /** UTC today (YYYY-MM-DD) — used to disable forward nav past today. */
  todayDate: string;
  /** YYYY-MM-DD of the prior day (always navigable — snapshot may be empty). */
  prevDate: string;
  /** YYYY-MM-DD of the next day, or null when activeDate === today. */
  nextDate: string | null;
  /** Last-7-day strip. Most recent first. */
  pills: DayPill[];
}

const NUM = "var(--font-mono, ui-monospace, SFMono-Regular, monospace)";

function ArrowLink({
  href,
  label,
  disabled,
  glyph,
}: {
  href: string;
  label: string;
  disabled: boolean;
  glyph: "<" | ">";
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="t10-arrow t10-arrow-off"
        title={label}
      >
        {glyph}
      </span>
    );
  }
  return (
    <Link href={href} className="t10-arrow" prefetch={false} aria-label={label}>
      {glyph}
    </Link>
  );
}

export function Top10DateNav({
  activeDate,
  todayDate,
  prevDate,
  nextDate,
  pills,
}: Top10DateNavProps) {
  const isToday = activeDate === todayDate;

  return (
    <header className="t10-hero">
      <div className="t10-hero-row">
        <div>
          <div className="t10-eyebrow">
            <span className="t10-eyebrow-tag">TOP 10</span>
            <span className="t10-eyebrow-sub">
              daily snapshot archive · UTC
            </span>
          </div>
          <h1 className="t10-title">The Top 10, frozen daily.</h1>
        </div>

        <div className="t10-nav">
          <ArrowLink
            href={`/tools/top-10?date=${prevDate}`}
            label="Previous day"
            disabled={false}
            glyph="<"
          />
          <span className="t10-date" style={{ fontFamily: NUM }}>
            {activeDate}
          </span>
          <ArrowLink
            href={nextDate ? `/tools/top-10?date=${nextDate}` : "#"}
            label="Next day"
            disabled={nextDate === null}
            glyph=">"
          />
          {!isToday && (
            <Link
              href="/tools/top-10"
              className="t10-jump-today"
              prefetch={false}
            >
              jump to today
            </Link>
          )}
        </div>
      </div>

      <nav className="t10-pills" aria-label="Recent snapshot dates">
        {pills.map((pill) => {
          const cls = [
            "t10-pill",
            pill.isActive ? "on" : "",
            pill.isToday ? "today" : "",
            pill.hasSnapshot ? "" : "empty",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <Link
              key={pill.date}
              href={`/tools/top-10?date=${pill.date}`}
              className={cls}
              prefetch={false}
              title={pill.date}
            >
              <span className="t10-pill-day">{pill.label}</span>
              <span className="t10-pill-iso">{pill.date.slice(5)}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
