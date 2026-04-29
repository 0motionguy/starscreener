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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 12,
        border: "1px solid #2B2B2F",
        borderRadius: 4,
        backgroundColor: "#1b1b1e",
      }}
    >
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 11,
          color: "#878787",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {"// templates"}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}
      >
        {TIER_LIST_TEMPLATES.map((template) => {
          const isLoading = loadingSlug === template.slug;
          const failed = errorSlug === template.slug;
          return (
            <button
              key={template.slug}
              type="button"
              onClick={() => loadTemplate(template)}
              disabled={isLoading}
              title={template.description}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 2,
                padding: "8px 10px",
                backgroundColor: "#262626",
                color: "#FBFBFB",
                border: failed ? "1px solid #EF4444" : "1px solid #2B2B2F",
                borderRadius: 2,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 11,
                cursor: isLoading ? "wait" : "pointer",
                textAlign: "left",
              }}
            >
              <span>{isLoading ? "loading…" : template.name}</span>
              <span style={{ color: "#5A5A5C", fontSize: 10 }}>
                {template.repos.length} repos
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
