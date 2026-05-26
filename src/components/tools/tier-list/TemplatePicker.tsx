"use client";

// TemplatePicker — preset repo packs for the tier-list pool.
//
// Each template hits /api/tier-lists/templates/[slug] and appends resolved
// repos to the editor's unranked pool (existing items dedupe in the store).
// The pack metadata (icon, theme name, description) is co-located here so the
// template cards stay declarative.
//
// 2026-05-24 rebuild: chips → large clickable cards. The chip version was
// invisible on first scan — Mirko's brief was "TEMPLATES need to be more
// present". Each card is a one-click way to populate the unranked pool with
// a curated repo pack, which is the fastest path to a finished tier list.

import { useState } from "react";

import { Icon } from "@/lib/icons";
import {
  useTierListEditor,
  type PoolItem,
} from "@/lib/tier-list/client-store";
import {
  TIER_LIST_TEMPLATES,
  type TierListTemplate,
} from "@/lib/tier-list/templates";

interface LoadResponse {
  ok: boolean;
  items?: PoolItem[];
  error?: string;
}

// Visual metadata per template — kept here (not in templates.ts) because it's
// purely presentational and the templates module is consumed by the OG card
// renderer which doesn't need icons.
const TEMPLATE_VISUALS: Record<
  string,
  { icon: string; tagline: string }
> = {
  "ai-agent-frameworks": {
    icon: "bot",
    tagline: "Autonomous agents · multi-step planners",
  },
  "code-editor-agents": {
    icon: "terminal",
    tagline: "Coding copilots · CLI agents · IDE plugins",
  },
  "rag-stacks": {
    icon: "database",
    tagline: "Vector stores · retrieval pipelines · embeddings",
  },
  "local-inference": {
    icon: "cpu",
    tagline: "Run models on your own hardware · GGUF · MLX",
  },
};

function visualsFor(template: TierListTemplate) {
  return (
    TEMPLATE_VISUALS[template.slug] ?? {
      icon: "sparkles",
      tagline: template.description,
    }
  );
}

export function TemplatePicker() {
  const addToPool = useTierListEditor((s) => s.addToPool);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [errorSlug, setErrorSlug] = useState<string | null>(null);
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);

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
      setLoadedSlug(template.slug);
      window.setTimeout(() => {
        setLoadedSlug((current) =>
          current === template.slug ? null : current,
        );
      }, 1800);
    } catch {
      setErrorSlug(template.slug);
    } finally {
      setLoadingSlug(null);
    }
  }

  return (
    <div
      className="tier-template-grid"
      role="group"
      aria-label="Template packs"
    >
      {TIER_LIST_TEMPLATES.map((template) => {
        const isLoading = loadingSlug === template.slug;
        const failed = errorSlug === template.slug;
        const justLoaded = loadedSlug === template.slug;
        const visuals = visualsFor(template);
        const stateClass = failed
          ? " is-error"
          : justLoaded
            ? " is-loaded"
            : isLoading
              ? " is-loading"
              : "";
        return (
          <button
            key={template.slug}
            type="button"
            onClick={() => loadTemplate(template)}
            disabled={isLoading}
            title={`${template.description} · ${template.repos.length} repos`}
            className={`tier-template-card${stateClass}`}
          >
            <span className="tier-template-icon" aria-hidden>
              <Icon name={visuals.icon} size="lg" />
            </span>
            <span className="tier-template-name">{template.name}</span>
            <span className="tier-template-desc">{visuals.tagline}</span>
            <span className="tier-template-foot">
              <span className="tier-template-count">
                <span className="num">{template.repos.length}</span>
                <span>repos</span>
              </span>
              <span className="tier-template-cta">
                {failed
                  ? "retry"
                  : justLoaded
                    ? "added"
                    : isLoading
                      ? "loading…"
                      : "load pack →"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
