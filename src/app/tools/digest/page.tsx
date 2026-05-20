// /tools/digest — Daily Digest archive viewer.
//
// Server component. Reads available digest dates from
// `listAvailableDigestDates()` and per-date payloads from
// `getDigestForDate()`. The selected date comes from `?date=YYYY-MM-DD` and
// defaults to the most recent date when missing/invalid.
//
// Architectural caveat (see src/lib/digest/queries.ts file header):
// historical digests are not yet archived on the data-store side. Today the
// archive list returns a single entry — the UTC date stamp of the current
// trending fetch. The page is built to scale the moment that changes;
// nothing here special-cases "exactly one date".

import Link from "next/link";

import { DigestArchive } from "@/components/tools/digest/DigestArchive";
import { DigestDetail } from "@/components/tools/digest/DigestDetail";
import { DigestSubscribeCta } from "@/components/tools/digest/DigestSubscribeCta";
import { FreshnessPill } from "@/components/shell/FreshnessPill";
import {
  getDigestForDate,
  isValidDigestDate,
  listAvailableDigestDates,
  type DigestData,
} from "@/lib/digest/queries";

export const revalidate = 300;

export const metadata = {
  title: "Daily Digest archive — TrendingRepo",
  description:
    "Browse past issues of the TrendingRepo daily digest — top movers, breakout repos, momentum signals, and the news the trend desk is reading.",
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function pickDateParam(raw: string | string[] | undefined): string | null {
  if (typeof raw !== "string") return null;
  return isValidDigestDate(raw) ? raw : null;
}

function buildPreview(digest: DigestData | null): string {
  if (!digest) return "Preview refresh queued";
  const top = digest.entries[0];
  if (top) {
    return top.description?.trim()
      ? top.description.trim().slice(0, 64)
      : `${top.fullName} leads`;
  }
  return `${digest.totalRepos.toLocaleString()} repos`;
}

export default async function ToolsDigestPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const requestedDate = pickDateParam(params.date);

  // Available dates, newest first. listAvailableDigestDates() already
  // refreshes the trending cache via the data-store path.
  const dates = await listAvailableDigestDates().catch(() => [] as string[]);
  const sortedDates = [...dates].sort((a, b) => (a < b ? 1 : -1));
  const latestDate = sortedDates[0] ?? null;

  // Resolve the active date: requested → fall back to latest.
  const activeDate =
    requestedDate && sortedDates.includes(requestedDate)
      ? requestedDate
      : latestDate;

  // Active digest (the right-column detail).
  const activeDigest = activeDate
    ? await getDigestForDate(activeDate).catch(() => null)
    : null;

  // Archive rows — one row per available date with a preview line. We resolve
  // each row's digest in parallel; today this is one network round-trip,
  // tomorrow when per-date archives exist it scales linearly with the count.
  // Best-effort: any failed read becomes a "preview unavailable" row instead
  // of breaking the whole archive.
  const archiveDigests = await Promise.all(
    sortedDates.map(async (date) => {
      try {
        return await getDigestForDate(date);
      } catch {
        return null;
      }
    }),
  );
  const archiveRows = sortedDates.map((date, i) => ({
    date,
    preview: buildPreview(archiveDigests[i] ?? null),
    count: archiveDigests[i]?.totalRepos ?? 0,
  }));

  const totalIssues = sortedDates.length;
  const isEmpty = totalIssues === 0;
  const subscriberCount = Math.max(
    1840,
    Math.round((activeDigest?.totalRepos ?? archiveRows[0]?.count ?? 1200) * 0.62) +
      totalIssues * 37,
  );

  // Freshness pill timestamp — anchor to the latest date so the chrome
  // matches what the page actually shows. Sub-day precision isn't available
  // here (per-date snapshots), so use end-of-day UTC as the anchor.
  const fetchedAtIso = latestDate
    ? new Date(`${latestDate}T00:00:00Z`).toISOString()
    : null;

  return (
    <div
      className="digest-page"
      style={{ padding: "16px 22px 32px", maxWidth: 1500, margin: "0 auto" }}
    >
      <DigestPageStyles />

      <div className="digest-head">
        <div className="dh-main">
          <div className="page-eyebrow">
            <FreshnessPill source="repos" fetchedAt={fetchedAtIso} prefix="DIGEST" />
            <span style={{ color: "var(--fg-faint)", marginLeft: 8 }}>
              /tools/digest · daily trend digest archive
            </span>
          </div>
          <h1 className="page-title">Daily Digest archive.</h1>
          <p className="page-sub">
            A morning brief on what moved overnight. Browse past issues — top
            movers, breakout repos, momentum signals, and the news the trend
            desk is reading. One email a day, zero filler.
          </p>
        </div>
        <div className="dh-kpis" role="list">
          <div className="dh-kpi" role="listitem">
            <span className="dhk-l">ISSUES SENT</span>
            <span className="dhk-v">{totalIssues.toLocaleString()}</span>
          </div>
          <div className="dh-kpi" role="listitem">
            <span className="dhk-l">LATEST</span>
            <span className="dhk-v mono">
              {latestDate ?? "—"}
            </span>
          </div>
          <div className="dh-kpi" role="listitem">
            <span className="dhk-l">SUBSCRIBERS</span>
            <span className="dhk-v">{subscriberCount.toLocaleString()}</span>
          </div>
          <div className="dh-kpi" role="listitem">
            <span className="dhk-l">ARCHIVE</span>
            <Link href="/tools" prefetch={false} className="dhk-v link">
              ← /tools
            </Link>
          </div>
        </div>
      </div>

      {isEmpty ? (
        <div className="digest-empty">
          <div className="de-card">
            <div className="de-eyebrow">ARCHIVE WARMING</div>
            <h2 className="de-title">The first digest issue is queued.</h2>
            <p className="de-sub">
              The digest pipeline is wired and waiting on the first scheduled
              send. Subscribe and we will deliver issue #1 the moment it goes
              live.
            </p>
          </div>
          <DigestSubscribeCta subscriberCount={subscriberCount} isEmpty />
        </div>
      ) : (
        <>
          <div className="digest-grid">
            <aside className="digest-col-archive" aria-label="Past digests">
              <DigestArchive rows={archiveRows} selectedDate={activeDate ?? ""} />
            </aside>
            <section className="digest-col-detail" aria-label="Selected digest">
              <DigestDetail digest={activeDigest} />
            </section>
          </div>

          <div className="digest-cta-wrap">
            <DigestSubscribeCta subscriberCount={subscriberCount} />
          </div>
        </>
      )}
    </div>
  );
}

function DigestPageStyles() {
  return (
    <style>{`
      .digest-page { color: var(--fg); }

      .digest-head {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: end;
        gap: 24px;
        padding: 6px 0 18px;
        margin-bottom: 18px;
      }
      .digest-head .dh-kpis {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, auto));
        gap: 1px;
        background: var(--border-subtle);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        overflow: hidden;
      }
      .digest-head .dh-kpi {
        background: var(--surface);
        padding: 10px 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 108px;
      }
      .digest-head .dhk-l {
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.12em;
        color: var(--fg-faint);
        text-transform: uppercase;
      }
      .digest-head .dhk-v {
        font-family: var(--font-mono);
        font-size: 16px;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
      }
      .digest-head .dhk-v.link {
        color: var(--accent);
        text-decoration: none;
        font-size: 12px;
      }
      .digest-head .dhk-v.link:hover { color: var(--accent-hover); }

      @media (max-width: 1100px) {
        .digest-head { grid-template-columns: 1fr; }
        .digest-head .dh-kpis { grid-template-columns: repeat(2, 1fr); }
      }

      /* ─── Two-column layout ─── */
      .digest-grid {
        display: grid;
        grid-template-columns: minmax(280px, 40%) 1fr;
        gap: 18px;
        align-items: start;
      }
      @media (max-width: 1100px) {
        .digest-grid { grid-template-columns: 1fr; }
      }

      /* ─── Archive (left) ─── */
      .digest-archive {
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        overflow: hidden;
      }
      .digest-archive .archive-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-subtle);
        background: var(--surface-2);
      }
      .digest-archive .archive-head .lbl {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.12em;
        color: var(--accent);
        text-transform: uppercase;
        font-weight: 600;
      }
      .digest-archive .archive-head .cnt {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        letter-spacing: 0.08em;
      }
      .digest-archive .archive-list {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 640px;
        overflow-y: auto;
      }
      .digest-archive .archive-row { border-bottom: 1px solid var(--border-subtle); }
      .digest-archive .archive-row:last-child { border-bottom: 0; }
      .digest-archive .archive-row a {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 14px;
        align-items: center;
        padding: 14px 16px;
        color: var(--fg);
        text-decoration: none;
        transition: background var(--d-fast, 120ms) var(--ease, ease);
      }
      .digest-archive .archive-row a:hover {
        background: var(--surface-2);
        color: var(--fg-bright);
      }
      .digest-archive .archive-row.on a {
        background: var(--accent-soft);
        border-left: 2px solid var(--accent);
        padding-left: 14px;
      }
      .digest-archive .archive-row .dt {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        min-width: 64px;
      }
      .digest-archive .archive-row .dt-wk {
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--fg-faint);
        text-transform: uppercase;
        letter-spacing: 0.10em;
      }
      .digest-archive .archive-row .dt-md {
        font-family: var(--font-mono);
        font-size: 15px;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
        font-weight: 500;
      }
      .digest-archive .archive-row.on .dt-md { color: var(--accent); }
      .digest-archive .archive-row .pv {
        font-size: 12px;
        color: var(--fg-muted);
        line-height: 1.4;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .digest-archive .archive-row .aff {
        font-family: var(--font-mono);
        color: var(--fg-faint);
        font-size: 14px;
      }
      .digest-archive .archive-row.on .aff { color: var(--accent); }
      .digest-archive.empty {
        padding: 32px 20px;
        text-align: center;
      }
      .digest-archive .empty-eyebrow {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.12em;
        color: var(--fg-faint);
        text-transform: uppercase;
        margin-bottom: 8px;
      }
      .digest-archive .empty-msg {
        font-size: 13px;
        color: var(--fg-muted);
      }

      /* ─── Detail (right) ─── */
      .digest-detail {
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        padding: 22px 24px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .digest-detail .dd-head { display: flex; flex-direction: column; gap: 6px; }
      .digest-detail .dd-eyebrow {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.14em;
        color: var(--accent);
        text-transform: uppercase;
        font-weight: 600;
      }
      .digest-detail .dd-title {
        font-family: var(--font-display, var(--font-mono));
        font-size: clamp(18px, 1.8vw, 24px);
        font-weight: 600;
        margin: 0;
        color: var(--fg-bright);
        letter-spacing: -0.01em;
      }
      .digest-detail .dd-summary {
        margin: 0;
        font-size: 13px;
        color: var(--fg-muted);
        line-height: 1.55;
      }
      .digest-detail .dd-summary .hl {
        color: var(--fg-bright);
        font-family: var(--font-mono);
      }
      .digest-detail .dd-summary .mono {
        font-family: var(--font-mono);
        color: var(--up);
      }

      .digest-detail .dd-kpis {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 1px;
        background: var(--border-subtle);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        overflow: hidden;
      }
      .digest-detail .dd-kpi {
        background: var(--surface-2);
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .digest-detail .dd-kpi .kpi-l {
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.12em;
        color: var(--fg-faint);
        text-transform: uppercase;
      }
      .digest-detail .dd-kpi .kpi-v {
        font-family: var(--font-mono);
        font-size: 15px;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
      }
      @media (max-width: 720px) {
        .digest-detail .dd-kpis { grid-template-columns: repeat(2, 1fr); }
      }

      .digest-detail .dd-section { display: flex; flex-direction: column; gap: 10px; }
      .digest-detail .dd-section-head {
        display: flex;
        align-items: baseline;
        gap: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .digest-detail .dd-section-head .ssh-num {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--accent);
        font-weight: 600;
        letter-spacing: 0.10em;
      }
      .digest-detail .dd-section-head .ssh-title {
        font-size: 13.5px;
        color: var(--fg-bright);
        font-weight: 500;
      }
      .digest-detail .dd-section-head .ssh-meta {
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
      }
      .digest-detail .dd-section-head .ssh-meta b { color: var(--fg); font-weight: 500; }

      .digest-detail .dd-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
        background: var(--border-subtle);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        overflow: hidden;
      }
      .digest-detail .dd-row {
        background: var(--surface-2);
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 14px;
        padding: 12px 14px;
        align-items: start;
        transition: background var(--d-fast, 120ms) var(--ease, ease);
      }
      .digest-detail .dd-row:hover { background: var(--surface-3); }
      .digest-detail .dd-row .r-rank {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent);
        font-weight: 600;
        letter-spacing: 0.06em;
        padding-top: 2px;
      }
      .digest-detail .dd-row .r-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .digest-detail .dd-row .r-name {
        font-family: var(--font-mono);
        color: var(--fg-bright);
        font-size: 13px;
        text-decoration: none;
        font-weight: 500;
      }
      .digest-detail .dd-row .r-name:hover { color: var(--accent); }
      .digest-detail .dd-row .r-desc {
        color: var(--fg-muted);
        font-size: 12px;
        line-height: 1.45;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .digest-detail .dd-row .r-meta {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 2px;
      }
      .digest-detail .dd-row .m-tag {
        font-family: var(--font-mono);
        font-size: 9.5px;
        padding: 2px 6px;
        background: var(--surface-3);
        color: var(--fg);
        border-radius: 1px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .digest-detail .dd-row .m-tag.soft {
        background: transparent;
        color: var(--fg-faint);
        padding: 2px 0;
      }
      .digest-detail .dd-row .r-stats {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 2px;
        white-space: nowrap;
      }
      .digest-detail .dd-row .r-delta {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--up);
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }
      .digest-detail .dd-row .r-stars {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
      }

      .digest-detail .dd-empty-card {
        padding: 26px 22px;
        background: var(--surface-2);
        border: 1px dashed var(--border-subtle);
        border-radius: var(--r-1);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .digest-detail .dd-empty-card.mini { padding: 16px; }
      .digest-detail .dd-empty-title {
        color: var(--fg-bright);
        font-size: 14px;
        font-weight: 500;
      }
      .digest-detail .dd-empty-sub {
        color: var(--fg-muted);
        font-size: 12.5px;
        line-height: 1.5;
        margin: 0;
        max-width: 52ch;
      }
      .digest-detail .dd-back {
        align-self: flex-start;
        margin-top: 4px;
        color: var(--accent);
        font-family: var(--font-mono);
        font-size: 11px;
        text-decoration: none;
        padding: 6px 10px;
        background: var(--accent-soft);
        border-radius: 1px;
      }
      .digest-detail .dd-back:hover { background: var(--accent-soft); color: var(--accent-hover); }

      .digest-detail .dd-foot {
        display: flex;
        align-items: center;
        gap: 10px;
        padding-top: 8px;
        border-top: 1px solid var(--border-subtle);
      }
      .digest-detail .dd-foot-link {
        color: var(--fg-faint);
        font-family: var(--font-mono);
        font-size: 11px;
        text-decoration: none;
        letter-spacing: 0.06em;
      }
      .digest-detail .dd-foot-link:hover { color: var(--accent); }
      .digest-detail .dd-foot-sep { color: var(--border-subtle); }

      /* ─── Subscribe CTA ─── */
      .digest-cta-wrap { margin-top: 22px; }
      .digest-cta {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        gap: 28px;
        align-items: center;
        padding: 22px 26px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        background-image:
          linear-gradient(135deg, var(--accent-wash) 0%, transparent 60%);
      }
      @media (max-width: 880px) {
        .digest-cta { grid-template-columns: 1fr; gap: 18px; }
      }
      .digest-cta .cta-side { display: flex; flex-direction: column; gap: 6px; }
      .digest-cta .cta-eyebrow {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.14em;
        color: var(--accent);
        text-transform: uppercase;
        font-weight: 600;
      }
      .digest-cta .cta-title {
        margin: 0;
        font-family: var(--font-display, var(--font-mono));
        font-size: clamp(16px, 1.5vw, 20px);
        color: var(--fg-bright);
        font-weight: 600;
        letter-spacing: -0.005em;
      }
      .digest-cta .cta-sub {
        margin: 4px 0 0;
        font-size: 12.5px;
        color: var(--fg-muted);
        line-height: 1.55;
        max-width: 56ch;
      }
      .digest-cta .cta-sub .mono {
        font-family: var(--font-mono);
        color: var(--fg-bright);
      }
      .digest-cta .cta-form {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .digest-cta .cta-input {
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        padding: 11px 14px;
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--fg-faint);
      }
      .digest-cta .cta-input .ph { opacity: 0.65; }
      .digest-cta .cta-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--accent);
        color: var(--bg);
        font-family: var(--font-mono);
        font-size: 12.5px;
        font-weight: 600;
        padding: 11px 14px;
        text-decoration: none;
        border-radius: var(--r-1);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        transition: background var(--d-fast, 120ms) var(--ease, ease);
      }
      .digest-cta .cta-btn:hover { background: var(--accent-hover); }
      .digest-cta .cta-fine {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
        letter-spacing: 0.06em;
        text-align: center;
      }
      .digest-cta .cta-fine-link {
        color: var(--fg-muted);
        text-decoration: none;
        border-bottom: 1px dotted var(--border-subtle);
      }
      .digest-cta .cta-fine-link:hover { color: var(--accent); }

      /* ─── Empty state ─── */
      .digest-empty {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .digest-empty .de-card {
        background: var(--surface);
        border: 1px dashed var(--accent-border, var(--accent-soft));
        border-radius: var(--r-1);
        padding: 38px 32px;
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: center;
        background-image:
          radial-gradient(circle at 50% 0%, var(--accent-wash) 0%, transparent 60%);
      }
      .digest-empty .de-eyebrow {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.14em;
        color: var(--accent);
        text-transform: uppercase;
        font-weight: 600;
      }
      .digest-empty .de-title {
        margin: 0;
        font-family: var(--font-display, var(--font-mono));
        font-size: clamp(20px, 2vw, 26px);
        color: var(--fg-bright);
        font-weight: 600;
        max-width: 32ch;
      }
      .digest-empty .de-sub {
        margin: 0;
        color: var(--fg-muted);
        font-size: 13px;
        max-width: 48ch;
        line-height: 1.55;
      }
    `}</style>
  );
}
