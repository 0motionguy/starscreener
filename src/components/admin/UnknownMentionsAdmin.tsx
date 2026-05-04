"use client";

// Admin UI for the unknown-mentions discovery lake. Reads
// data/unknown-mentions-promoted.json (generated daily by
// scripts/promote-unknown-mentions.mjs), renders top-N candidates, lets the
// operator promote one into the manual-repos tracked seed via
// /api/admin/unknown-mentions (which runs submitRepoToQueue +
// runRepoIntakeForSubmission server-side).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";

import type {
  PromotedUnknownMention,
  PromotedUnknownMentionsFile,
} from "@/app/admin/unknown-mentions/page";

type RowStatus = "pending" | "promoted" | "error";

interface RowState {
  status: RowStatus;
  message?: string;
  repoPath?: string;
}

export function UnknownMentionsAdmin({
  initialData,
}: {
  initialData: PromotedUnknownMentionsFile;
}) {
  const router = useRouter();
  const [data, setData] = useState<PromotedUnknownMentionsFile>(initialData);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [busyFullName, setBusyFullName] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const rows = data.rows;
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.sources.some((s) => s.toLowerCase().includes(q)),
    );
  }, [data.rows, filter]);

  const reload = useCallback(async () => {
    setReloading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/unknown-mentions", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        router.push("/admin/login?next=/admin/unknown-mentions");
        return;
      }
      const payload = (await res.json()) as
        | { ok: true; data: PromotedUnknownMentionsFile }
        | { ok: false; error: string };
      if (!payload.ok) throw new Error(payload.error ?? "request failed");
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReloading(false);
    }
  }, [router]);

  async function promote(fullName: string) {
    setBusyFullName(fullName);
    setError(null);
    setRowState((prev) => ({ ...prev, [fullName]: { status: "pending" } }));
    try {
      const res = await fetch("/api/admin/unknown-mentions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName }),
      });
      if (res.status === 401) {
        router.push("/admin/login?next=/admin/unknown-mentions");
        return;
      }
      const payload = (await res.json()) as
        | { ok: true; repoPath: string; alreadyTracked?: boolean }
        | { ok: false; error: string };
      if (!payload.ok) throw new Error(payload.error ?? "promote failed");
      setRowState((prev) => ({
        ...prev,
        [fullName]: {
          status: "promoted",
          repoPath: payload.repoPath,
          message: payload.alreadyTracked ? "already tracked" : "promoted",
        },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRowState((prev) => ({
        ...prev,
        [fullName]: { status: "error", message },
      }));
      setError(message);
    } finally {
      setBusyFullName(null);
    }
  }

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1100px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border-primary pb-6">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wider inline-flex items-center gap-2">
              <ShieldAlert className="size-5 text-warning" aria-hidden />
              Unknown Mentions Discovery
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Top-N github repos that signal sources mentioned but we don&apos;t yet
              track. Promote a candidate to scan + add it to the manual-repos
              tracked seed. Daily compaction:{" "}
              <code className="rounded bg-bg-muted px-1 py-0.5 text-[11px]">
                scripts/promote-unknown-mentions.mjs
              </code>
              .
            </p>
            <p className="mt-1 text-[11px] text-text-tertiary">
              {data.generatedAt ? (
                <>
                  Generated{" "}
                  {new Date(data.generatedAt)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}{" "}
                  UTC · lake size {data.totalUnknownMentions} ·{" "}
                  {data.distinctRepos} distinct repos · top {data.topN} shown ·
                  minSources={data.minSources}
                </>
              ) : (
                <>
                  No promoted snapshot yet. The daily workflow runs at 04:30
                  UTC; trigger manually via{" "}
                  <code className="rounded bg-bg-muted px-1 py-0.5 text-[11px]">
                    gh workflow run promote-unknown-mentions.yml
                  </code>
                  .
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={reloading}
            className="inline-flex items-center gap-2 rounded-md border border-border-primary bg-bg-muted px-3 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-text-primary hover:bg-bg-card-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reloading ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            Reload
          </button>
        </header>

        {error ? (
          <div className="mb-4 rounded-md border border-down/60 bg-down/5 px-3 py-2 text-sm text-down">
            {error}
          </div>
        ) : null}

        <section className="mb-4 flex items-center gap-2">
          <Search className="size-4 text-text-tertiary" aria-hidden />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by repo or source…"
            className="flex-1 rounded-md border border-border-primary bg-bg-muted px-3 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-tertiary"
          />
          <span className="font-mono text-[11px] text-text-tertiary">
            {filtered.length} / {data.rows.length}
          </span>
        </section>

        {filtered.length === 0 ? (
          <div className="rounded-card border border-dashed border-border-primary bg-bg-muted/40 px-4 py-6 text-sm text-text-tertiary">
            {data.rows.length === 0
              ? "Nothing promoted yet."
              : "No matches for that filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="border-b border-border-primary text-left text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
                  <th className="py-2 pr-3">Repo</th>
                  <th className="py-2 px-3 text-right">Sources</th>
                  <th className="py-2 px-3 text-right">Mentions</th>
                  <th className="py-2 px-3">Source list</th>
                  <th className="py-2 px-3">First seen</th>
                  <th className="py-2 px-3">Last seen</th>
                  <th className="py-2 pl-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <UnknownMentionRow
                    key={row.fullName}
                    row={row}
                    state={rowState[row.fullName]}
                    busy={busyFullName === row.fullName}
                    onPromote={() => void promote(row.fullName)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function UnknownMentionRow({
  row,
  state,
  busy,
  onPromote,
}: {
  row: PromotedUnknownMention;
  state: RowState | undefined;
  busy: boolean;
  onPromote: () => void;
}) {
  const githubUrl = `https://github.com/${row.fullName}`;
  return (
    <tr className="border-b border-border-primary/40 align-top">
      <td className="py-2 pr-3">
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-text-primary hover:underline"
        >
          {row.fullName}
          <ExternalLink className="size-3 text-text-tertiary" aria-hidden />
        </a>
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-text-primary">
        {row.sourceCount}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-text-secondary">
        {row.totalCount}
      </td>
      <td className="py-2 px-3 text-text-tertiary">
        {row.sources.join(", ")}
      </td>
      <td className="py-2 px-3 text-text-tertiary">
        {row.firstSeenAt.slice(0, 10)}
      </td>
      <td className="py-2 px-3 text-text-tertiary">
        {row.lastSeenAt.slice(0, 10)}
      </td>
      <td className="py-2 pl-3 text-right">
        {state?.status === "promoted" ? (
          <span className="inline-flex items-center gap-1.5 text-up">
            <CheckCircle2 className="size-3.5" aria-hidden />
            {state.repoPath ? (
              <Link
                href={state.repoPath}
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {state.message ?? "promoted"}
              </Link>
            ) : (
              <span>{state.message ?? "promoted"}</span>
            )}
          </span>
        ) : (
          <button
            type="button"
            onClick={onPromote}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-up/60 bg-up/10 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-up hover:bg-up/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 className="size-3.5" aria-hidden />
            )}
            Promote
          </button>
        )}
      </td>
    </tr>
  );
}

export default UnknownMentionsAdmin;
