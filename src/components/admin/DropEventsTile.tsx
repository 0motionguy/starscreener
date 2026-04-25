"use client";

// Tile for the admin dashboard. Shows the count of public "Drop repo"
// attempts in the last 7 days, broken down by outcome (already_tracked,
// duplicate, created). Mounts → fetches /api/admin/drop-events?days=7
// with credentials. 401 redirects to the admin login page.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface DropEventSummary {
  alreadyTracked: number;
  duplicate: number;
  created: number;
  total: number;
}

interface DropEventsResponse {
  ok: true;
  days: number;
  summary: DropEventSummary;
  recent: unknown[];
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; summary: DropEventSummary };

export default function DropEventsTile() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/drop-events?days=7", {
          credentials: "include",
          cache: "no-store",
        });
        if (res.status === 401) {
          router.push("/admin/login?next=/admin");
          return;
        }
        if (!res.ok) {
          if (!cancelled) setState({ status: "error" });
          return;
        }
        const payload = (await res.json()) as DropEventsResponse;
        if (cancelled) return;
        if (!payload.ok || !payload.summary) {
          setState({ status: "error" });
          return;
        }
        setState({ status: "ready", summary: payload.summary });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state.status === "loading") {
    return (
      <div className="rounded-card border border-border-primary bg-bg-card p-3">
        <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
          Drop attempts (7d)
        </div>
        <div className="mt-1 text-base font-semibold">…</div>
        <div className="mt-1 text-[10px] text-text-tertiary">&nbsp;</div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-card border border-border-primary bg-bg-card p-3">
        <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
          Drop attempts (7d)
        </div>
        <div className="mt-1 text-base font-semibold">—</div>
        <div className="mt-1 text-[10px] text-text-tertiary">&nbsp;</div>
      </div>
    );
  }

  const { alreadyTracked, duplicate, created, total } = state.summary;
  return (
    <div className="rounded-card border border-border-primary bg-bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
        Drop attempts (7d)
      </div>
      <div className="mt-1 text-base font-semibold">{total}</div>
      <div className="mt-1 text-[10px] text-text-tertiary">
        {alreadyTracked} already tracked · {created} new · {duplicate} dup
      </div>
    </div>
  );
}
