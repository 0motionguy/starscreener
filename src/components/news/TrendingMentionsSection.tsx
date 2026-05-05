import Link from "next/link";
import {
  getTrendingMentionsTop50,
  type TrendingMentionsSource,
} from "@/lib/trending-mentions";

function formatInt(value: number): string {
  return value.toLocaleString("en-US");
}

export function TrendingMentionsSection({
  source,
  accent,
}: {
  source: TrendingMentionsSource;
  accent: string;
}) {
  const rows = getTrendingMentionsTop50(source);
  if (rows.length === 0) return null;

  return (
    <section
      style={{
        border: "1px solid var(--v4-line-200)",
        background: "var(--v4-bg-050)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        className="v2-mono flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-[0.18em]"
        style={{
          borderBottom: "1px solid var(--v4-line-100)",
          background: "var(--v4-bg-025)",
          color: "var(--v4-ink-300)",
        }}
      >
        <span style={{ color: accent }}>TRENDING-MENTIONS</span>
        <span>Top 50 (boosted)</span>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-2">
        {rows.slice(0, 12).map((row) => {
          const [owner, name] = row.fullName.split("/", 2);
          return (
            <li
              key={row.fullName}
              className="grid grid-cols-[30px_1fr_58px] items-center gap-2 px-3 py-2"
              style={{ borderBottom: "1px dashed var(--v4-line-100)" }}
            >
              <span
                className="v2-mono text-[11px] tabular-nums"
                style={{ color: "var(--v4-ink-400)" }}
              >
                #{row.rank}
              </span>
              <Link
                href={`/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`}
                className="truncate text-[12px] transition-colors hover:text-[color:var(--v4-acc)]"
                style={{ color: "var(--v4-ink-100)" }}
                title={row.fullName}
              >
                {row.fullName}
              </Link>
              <span
                className="text-right text-[11px] tabular-nums"
                style={{ color: "var(--v4-ink-300)" }}
                title={`${formatInt(row.sourceMentions24h)} source mentions / 24h`}
              >
                {formatInt(row.sourceMentions24h)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

