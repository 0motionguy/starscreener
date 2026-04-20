"use client";

// StarScreener - Compare client UI.

import Link from "next/link";
import { useEffect, useState } from "react";
import { GitCompareArrows } from "lucide-react";
import { useCompareStore } from "@/lib/store";
import { CompareSelector } from "@/components/compare/CompareSelector";
import { CompareChart } from "@/components/compare/CompareChart";
import { CompareTable } from "@/components/compare/CompareTable";
import type { Repo } from "@/lib/types";

export function CompareClient() {
  const repoIds = useCompareStore((s) => s.repos);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Compare Repos - StarScreener";
  }, []);

  useEffect(() => {
    if (repoIds.length === 0) {
      setRepos([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/repos?ids=${encodeURIComponent(repoIds.join(","))}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { repos?: Repo[] };
        const byId = new Map(
          (Array.isArray(data.repos) ? data.repos : []).map((r) => [r.id, r]),
        );
        const ordered = repoIds
          .map((id) => byId.get(id))
          .filter((r): r is Repo => r !== undefined);
        setRepos(ordered);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[compare] fetch failed", err);
        setRepos([]);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [repoIds]);

  const hasEnough = repos.length >= 2;

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs text-text-tertiary"
      >
        <Link href="/" className="hover:text-text-primary transition-colors">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Compare</span>
      </nav>

      <div>
        <h1 className="font-display text-3xl font-bold text-text-primary">
          Compare Repos
        </h1>
        <p className="text-text-secondary mt-1">
          Side-by-side analysis of up to 4 repos
        </p>
      </div>

      <CompareSelector />

      {hasEnough ? (
        <div className="space-y-6 animate-fade-in">
          <CompareChart repos={repos} />
          <CompareTable repos={repos} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in">
          <div className="p-4 rounded-full bg-bg-card border border-border-primary">
            <GitCompareArrows size={32} className="text-text-tertiary" />
          </div>
          <p className="text-text-tertiary text-sm text-center max-w-xs">
            {loading && repoIds.length > 0
              ? "Loading selected repos..."
              : "Select at least 2 repos to compare their momentum, stars, and activity side by side."}
          </p>
        </div>
      )}
    </main>
  );
}
