"use client";

// TemplatePicker - preset repo packs for the tier list pool.

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
      const res = await fetch(`/api/tier-lists/templates/${template.slug}`);
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
    <div className="tier-templates">
      {TIER_LIST_TEMPLATES.map((template) => {
        const isLoading = loadingSlug === template.slug;
        const failed = errorSlug === template.slug;
        return (
          <button
            key={template.slug}
            type="button"
            onClick={() => loadTemplate(template)}
            disabled={isLoading}
            title={`${template.description} / ${template.repos.length} repos`}
            className={`sp-pill${failed ? " is-error" : ""}`}
          >
            <span>{isLoading ? "Loading..." : shortLabel(template.slug)}</span>
            <span className="ct">{template.repos.length}</span>
          </button>
        );
      })}
    </div>
  );
}

const SHORT_LABELS: Record<string, string> = {
  "ai-agent-frameworks": "AI agents",
  "code-editor-agents": "Code editors",
  "rag-stacks": "RAG stacks",
  "local-inference": "Local infer",
};

function shortLabel(slug: string): string {
  return SHORT_LABELS[slug] ?? slug.toUpperCase().replace(/-/g, " ");
}
