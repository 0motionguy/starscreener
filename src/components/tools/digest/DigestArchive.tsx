// DigestArchive — left-column chronological list of past digest dates.
// Server component. Renders one row per date with a date label, short headline
// preview (from the digest's top repo), and a "→" affordance. The currently
// selected row gets a highlighted treatment via .on. Each row links with
// `?date=YYYY-MM-DD` so the URL stays canonical and shareable.

import Link from "next/link";

interface DigestArchiveRow {
  date: string; // YYYY-MM-DD
  preview: string;
  count: number;
}

interface DigestArchiveProps {
  rows: DigestArchiveRow[];
  selectedDate: string;
}

// Formats a YYYY-MM-DD string to "Wed · May 20" without spinning up Intl
// locale negotiation. UTC-based to match the digest date convention.
function formatRowDate(date: string): { weekday: string; long: string } {
  const ts = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ts)) {
    return { weekday: "—", long: date };
  }
  const d = new Date(ts);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  const month = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][d.getUTCMonth()];
  return {
    weekday,
    long: `${month} ${d.getUTCDate()}`,
  };
}

export function DigestArchive({ rows, selectedDate }: DigestArchiveProps) {
  if (rows.length === 0) {
    return (
      <div className="digest-archive empty">
        <div className="empty-eyebrow">ARCHIVE</div>
        <div className="empty-msg">Digest archive warming.</div>
      </div>
    );
  }

  return (
    <div className="digest-archive">
      <div className="archive-head">
        <span className="lbl">ARCHIVE</span>
        <span className="cnt">{rows.length.toLocaleString()} ISSUES</span>
      </div>
      <ul className="archive-list" role="list">
        {rows.map((row) => {
          const { weekday, long } = formatRowDate(row.date);
          const isOn = row.date === selectedDate;
          return (
            <li key={row.date} className={`archive-row${isOn ? " on" : ""}`}>
              <Link
                href={`/tools/digest?date=${row.date}`}
                prefetch={false}
                aria-current={isOn ? "true" : undefined}
                aria-label={`View digest from ${long}`}
              >
                <span className="dt">
                  <span className="dt-wk">{weekday}</span>
                  <span className="dt-md">{long}</span>
                </span>
                <span className="pv">{row.preview}</span>
                <span className="aff" aria-hidden>
                  {isOn ? "▸" : "→"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
