// Admin — writer-provenance dashboard.
//
// AUDIT-2026-05-04 §B2 — 27 data-store keys are dual-written by GHA
// scripts AND Railway worker fetchers. Last writer wins, but historically
// nothing surfaced WHO won. This page reads ss:meta:v1:<key> for the
// known keyset, parses the WriterMeta envelope, and shows:
//   - which writer (worker:<service>:<fetcher> vs gha:<workflow>) wrote
//     last
//   - when it wrote
//   - whether the meta is in the new envelope format or the legacy bare-
//     ISO format (legacy = needs the next write to upgrade)
//
// Auth: cookie-session — same pattern as /admin/scoring-shadow,
// /admin/staleness, etc.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSession,
} from "@/lib/api/admin-session";
import { getDataStore, type WriterMeta } from "@/lib/data-store";

export const metadata: Metadata = {
  title: "Admin — Writer Provenance",
  description:
    "Last writer + timestamp per data-store key. Surfaces dual-writer races between GHA scripts and the Railway worker.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Canonical key set — every key written by either lane (per audit §3
// inventory). Sorted by category for readable rendering. Adding a key here
// is the only step needed for it to appear on this dashboard.
const TRACKED_KEYS: ReadonlyArray<{ category: string; key: string }> = [
  // Heartbeat / core trending
  { category: "Heartbeat", key: "trending" },
  { category: "Heartbeat", key: "deltas" },
  { category: "Heartbeat", key: "hot-collections" },
  { category: "Heartbeat", key: "recent-repos" },
  { category: "Heartbeat", key: "repo-metadata" },
  { category: "Heartbeat", key: "repo-profiles" },
  // Per-source mention sources
  { category: "Mentions", key: "hackernews-trending" },
  { category: "Mentions", key: "hackernews-repo-mentions" },
  { category: "Mentions", key: "reddit-mentions" },
  { category: "Mentions", key: "reddit-all-posts" },
  { category: "Mentions", key: "reddit-baselines" },
  { category: "Mentions", key: "bluesky-trending" },
  { category: "Mentions", key: "bluesky-mentions" },
  { category: "Mentions", key: "lobsters-trending" },
  { category: "Mentions", key: "lobsters-mentions" },
  { category: "Mentions", key: "devto-trending" },
  { category: "Mentions", key: "devto-mentions" },
  { category: "Mentions", key: "producthunt-launches" },
  // LLM / pack
  { category: "LLM Pack", key: "npm-packages" },
  { category: "LLM Pack", key: "huggingface-trending" },
  { category: "LLM Pack", key: "huggingface-datasets" },
  { category: "LLM Pack", key: "huggingface-spaces" },
  // Funding / revenue
  { category: "Funding", key: "funding-news" },
  { category: "Funding", key: "funding-news-crunchbase" },
  { category: "Funding", key: "funding-news-x" },
  { category: "Funding", key: "trustmrr-startups" },
  { category: "Funding", key: "revenue-overlays" },
  { category: "Funding", key: "revenue-benchmarks" },
  { category: "Funding", key: "manual-repos" },
  { category: "Funding", key: "revenue-manual-matches" },
  // Research
  { category: "Research", key: "arxiv-recent" },
  { category: "Research", key: "arxiv-enriched" },
  { category: "Research", key: "claude-rss" },
  { category: "Research", key: "openai-rss" },
  { category: "Research", key: "awesome-skills" },
  // Skills
  { category: "Skills", key: "trending-skill" },
  { category: "Skills", key: "trending-skill-skillsmp" },
  { category: "Skills", key: "trending-skill-smithery" },
  { category: "Skills", key: "trending-skill-lobehub" },
  { category: "Skills", key: "skill-derivative-count" },
  // MCP
  { category: "MCP", key: "trending-mcp" },
  { category: "MCP", key: "mcp-smithery-rank" },
  { category: "MCP", key: "mcp-liveness" },
  { category: "MCP", key: "mcp-downloads" },
  { category: "MCP", key: "mcp-downloads-pypi" },
  { category: "MCP", key: "mcp-dependents" },
  // Consensus
  { category: "Consensus", key: "consensus-trending" },
  { category: "Consensus", key: "consensus-verdicts" },
  { category: "Consensus", key: "engagement-composite" },
  { category: "Consensus", key: "hn-pulse" },
  { category: "Consensus", key: "trendshift-daily" },
  // Ops / curated
  { category: "Ops", key: "collection-rankings" },
  { category: "Ops", key: "agent-commerce" },
  { category: "Ops", key: "scoring-shadow-report" },
  { category: "Ops", key: "staleness-report" },
];

interface KeyRow {
  category: string;
  key: string;
  meta: WriterMeta | null;
  writtenAt: string | null;
  ageHours: number | null;
}

function categorizeWriter(writerId: string | undefined): "worker" | "gha" | "script" | "vercel" | "unknown" {
  if (!writerId) return "unknown";
  if (writerId.startsWith("worker:")) return "worker";
  if (writerId.startsWith("gha:")) return "gha";
  if (writerId.startsWith("script:")) return "script";
  if (writerId.startsWith("vercel:")) return "vercel";
  return "unknown";
}

function ageHoursFrom(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 3_600_000;
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const ageMs = Date.now() - t;
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)}s ago`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m ago`;
  if (ageMs < 86_400_000) return `${(ageMs / 3_600_000).toFixed(1)}h ago`;
  return `${(ageMs / 86_400_000).toFixed(1)}d ago`;
}

async function loadRows(): Promise<KeyRow[]> {
  const store = getDataStore();
  const rows = await Promise.all(
    TRACKED_KEYS.map(async ({ category, key }) => {
      const [writtenAt, meta] = await Promise.all([
        store.writtenAt(key),
        store.writerMeta(key),
      ]);
      return {
        category,
        key,
        meta,
        writtenAt,
        ageHours: ageHoursFrom(writtenAt),
      };
    }),
  );
  return rows;
}

export default async function WritersAdminPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (!verifyAdminSession(session)) {
    redirect("/admin/login?next=/admin/writers");
  }

  const rows = await loadRows();
  const grouped = new Map<string, KeyRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.category) ?? [];
    list.push(row);
    grouped.set(row.category, list);
  }

  const stats = {
    total: rows.length,
    worker: rows.filter((r) => categorizeWriter(r.meta?.writerId) === "worker").length,
    gha: rows.filter((r) => categorizeWriter(r.meta?.writerId) === "gha").length,
    script: rows.filter((r) => categorizeWriter(r.meta?.writerId) === "script").length,
    legacy: rows.filter((r) => r.writtenAt && !r.meta).length,
    missing: rows.filter((r) => !r.writtenAt).length,
  };

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-10">
      <header className="mb-8">
        <p
          className="v2-mono text-[10px] tracking-[0.22em] uppercase"
          style={{ color: "var(--v3-ink-400)" }}
        >
          Admin / Writer Provenance
        </p>
        <h1
          className="mt-1 text-[28px] leading-tight"
          style={{ color: "var(--v3-ink-100)" }}
        >
          Who wrote each data-store key last?
        </h1>
        <p
          className="mt-2 text-[13px] max-w-3xl"
          style={{ color: "var(--v3-ink-300)" }}
        >
          AUDIT-2026-05-04 §B2 — 27 keys have dual writers (GHA scripts +
          Railway worker fetchers). Last writer wins. This dashboard reads
          the WriterMeta envelope from <code>ss:meta:v1:&lt;key&gt;</code> so
          dual-writer races are visible without a manual grep. Legacy rows
          (bare-ISO meta with no envelope) will upgrade on the next write.
        </p>
        <p
          className="v2-mono mt-3 text-[10px] tracking-[0.18em] uppercase"
          style={{ color: "var(--v3-ink-400)" }}
        >
          {stats.total} keys · worker {stats.worker} · gha {stats.gha} · script {stats.script}
          {" · "}legacy {stats.legacy} · missing {stats.missing}
        </p>
      </header>

      <div className="space-y-10">
        {Array.from(grouped.entries()).map(([category, list]) => (
          <section key={category}>
            <h2
              className="v2-mono text-[11px] tracking-[0.18em] uppercase mb-3"
              style={{ color: "var(--v3-ink-300)" }}
            >
              {`// ${category}`}
            </h2>
            <div
              className="overflow-x-auto"
              style={{ border: "1px solid var(--v3-line-100)" }}
            >
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr style={{ background: "var(--v3-bg-50)" }}>
                    <Th>Key</Th>
                    <Th>Writer</Th>
                    <Th>Workflow / Fetcher</Th>
                    <Th>Last write</Th>
                    <Th>Age</Th>
                    <Th>Meta format</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <KeyRowComponent key={row.key} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="text-left px-3 py-2 v2-mono text-[10px] tracking-[0.18em] uppercase"
      style={{ color: "var(--v3-ink-400)" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  mono = false,
  color,
}: {
  children: React.ReactNode;
  mono?: boolean;
  color?: string;
}) {
  return (
    <td
      className={`px-3 py-2 ${mono ? "v2-mono text-[11px]" : ""}`}
      style={{ color: color ?? "var(--v3-ink-200)" }}
    >
      {children}
    </td>
  );
}

function KeyRowComponent({ row }: { row: KeyRow }) {
  const writerCategory = categorizeWriter(row.meta?.writerId);
  const writerColor =
    writerCategory === "worker"
      ? "var(--v3-acc-violet, #a78bfa)"
      : writerCategory === "gha"
        ? "var(--v3-acc-cyan, #3ad6c5)"
        : writerCategory === "script"
          ? "var(--v3-acc-orange, #ff9447)"
          : "var(--v3-ink-400)";

  const ageColor =
    row.ageHours === null
      ? "var(--v3-ink-400)"
      : row.ageHours > 24
        ? "var(--sig-red, #ff4d4d)"
        : row.ageHours > 6
          ? "var(--v3-acc-orange, #ff9447)"
          : "var(--sig-green, #5be08e)";

  const metaFormatLabel = row.meta
    ? "envelope"
    : row.writtenAt
      ? "legacy-iso"
      : "missing";
  const metaFormatColor = row.meta
    ? "var(--sig-green, #5be08e)"
    : row.writtenAt
      ? "var(--v3-acc-orange, #ff9447)"
      : "var(--sig-red, #ff4d4d)";

  return (
    <tr style={{ borderTop: "1px solid var(--v3-line-100)" }}>
      <Td mono>{row.key}</Td>
      <Td mono color={writerColor}>{writerCategory}</Td>
      <Td mono>
        {row.meta?.sourceWorkflow ??
          row.meta?.writerId?.split(":").slice(1).join(":") ??
          "—"}
      </Td>
      <Td mono>{row.writtenAt ?? "—"}</Td>
      <Td mono color={ageColor}>{relTime(row.writtenAt)}</Td>
      <Td mono color={metaFormatColor}>{metaFormatLabel}</Td>
    </tr>
  );
}
