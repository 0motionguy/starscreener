"use client";

// TemplatePicker — shows the available preset templates as a row of cards.
// Clicking a template loads its repo list into the unranked pool.

import { useState } from "react";

import { useTierListEditor, type PoolItem } from "@/lib/tier-list/client-store";
import {
  TIER_LIST_TEMPLATES,
  type TierListTemplate,
} from "@/lib/tier-list/templates";

interface LoadResponse {
  ok: boolean;
  items?: PoolItem[];
  error?: string;
}

export function TemplatePicker() {
  const addToPool = useTierListEditor((s) => s.addToPool);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [errorSlug, setErrorSlug] = useState<string | null>(null);

  async function loadTemplate(template: TierListTemplate) {
    setErrorSlug(null);
    setLoadingSlug(template.slug);
    try {
      const res = await fetch(
        `/api/tier-lists/templates/${template.slug}`,
      );
      const data = (await res.json()) as LoadResponse;
      if (!res.ok || !data.ok || !Array.isArray(data.items)) {
        setErrorSlug(template.slug);
        return;
      }
      for (const item of data.items) {
        addToPool(item);
      }
    } catch {
      setErrorSlug(template.slug);
    } finally {
      setLoadingSlug(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono uppercase tracking-[0.14em] text-[11px] text-text-tertiary shrink-0">
        TEMPLATES
      </span>
      {TIER_LIST_TEMPLATES.map((template) => {
        const isLoading = loadingSlug === template.slug;
        const failed = errorSlug === template.slug;
        return (
          <button
            key={template.slug}
            type="button"
            onClick={() => loadTemplate(template)}
            disabled={isLoading}
            title={`${template.description} · ${template.repos.length} repos`}
            className={`inline-flex items-center gap-1.5 rounded-[3px] border bg-bg-secondary px-2.5 py-1 font-mono uppercase tracking-[0.14em] text-[11px] text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary ${
              failed ? "border-down" : "border-border-primary"
            } ${isLoading ? "cursor-wait opacity-60" : "cursor-pointer"}`}
          >
            <span>{isLoading ? "LOADING…" : shortLabel(template.slug)}</span>
            <span className="text-text-tertiary text-[10px]">
              {template.repos.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Compact uppercase chip label per the meme-format reference.
const SHORT_LABELS: Record<string, string> = {
  "ai-agent-frameworks": "AI AGENTS",
  "code-editor-agents": "CODE EDITORS",
  "rag-stacks": "RAG STACKS",
  "local-inference": "LOCAL INFER",
};

function shortLabel(slug: string): string {
  return SHORT_LABELS[slug] ?? slug.toUpperCase().replace(/-/g, " ");
}
