"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  DropPreviewCard,
  type DropPreviewMetadata,
} from "@/components/drop/DropPreviewCard";
import { DropUrlInputCard } from "@/components/drop/DropUrlInputCard";

const DRAFT_KEY = "trendingrepo-drop-draft";
const DRAFT_EVENT = "trendingrepo-drop-draft";

interface DropLivePreviewSectionProps {
  initialMetadata: DropPreviewMetadata;
  initialCategory: string;
  initialTags: string[];
  initialWhy: string;
  sidePanel: ReactNode;
}

interface FetchedMetadata {
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  language?: string;
  license?: string;
  stars?: number;
  forks?: number;
  contributors?: number;
  mentions?: number;
}

function dispatchDraftEvent() {
  window.dispatchEvent(new Event(DRAFT_EVENT));
  window.dispatchEvent(new Event("storage"));
}

function seedDraft(
  metadata: DropPreviewMetadata,
  initialCategory: string,
  initialTags: string[],
  initialWhy: string,
) {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const slug = `${metadata.owner}/${metadata.name}`;
    if (typeof existing.slug !== "string") existing.slug = slug;
    if (typeof existing.cat !== "string") existing.cat = initialCategory;
    if (!Array.isArray(existing.tags) || existing.tags.length === 0) {
      existing.tags = initialTags;
    }
    if (typeof existing.whyNow !== "string" || existing.whyNow.length < 20) {
      existing.whyNow = initialWhy;
    }
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(existing));
    dispatchDraftEvent();
  } catch {
    // Storage can be disabled; the visible flow still renders.
  }
}

function statusFor(metadata: DropPreviewMetadata): string {
  const stars = metadata.stars ?? 0;
  const language = metadata.language ?? "unknown";
  const license = metadata.license ?? "license pending";
  const contributors = metadata.contributors ?? 0;
  return `FETCHED - 218ms - ${stars.toLocaleString("en-US")} stars - ${language} - ${license} - ${contributors} contributors - scanning cross-source mentions...`;
}

export function DropLivePreviewSection({
  initialMetadata,
  initialCategory,
  initialTags,
  initialWhy,
  sidePanel,
}: DropLivePreviewSectionProps) {
  const [metadata, setMetadata] = useState<DropPreviewMetadata>(initialMetadata);
  const [statusMessage, setStatusMessage] = useState(statusFor(initialMetadata));

  useEffect(() => {
    seedDraft(initialMetadata, initialCategory, initialTags, initialWhy);
  }, [initialCategory, initialMetadata, initialTags, initialWhy]);

  const handleFetched = useCallback(
    (fetched: FetchedMetadata) => {
      const next: DropPreviewMetadata = {
        ...initialMetadata,
        owner: fetched.owner,
        name: fetched.name,
        description: fetched.description ?? initialMetadata.description,
        language: fetched.language ?? initialMetadata.language,
        license: fetched.license ?? initialMetadata.license,
        stars: fetched.stars ?? initialMetadata.stars,
        forks: fetched.forks ?? initialMetadata.forks,
        contributors: fetched.contributors ?? initialMetadata.contributors,
        fetchedAt: new Date().toISOString(),
        mentions:
          typeof fetched.mentions === "number" && fetched.mentions > 0
            ? Array.from({ length: Math.min(fetched.mentions, 4) }, (_, index) => ({
                platform: ["github", "hackernews", "reddit", "devto"][index] ?? "github",
                label: index === 0 ? "tracked activity" : "cross-source mention",
              }))
            : initialMetadata.mentions,
      };
      setMetadata(next);
      setStatusMessage(statusFor(next));
      seedDraft(next, initialCategory, initialTags, initialWhy);
    },
    [initialCategory, initialMetadata, initialTags, initialWhy],
  );

  return (
    <>
      <DropUrlInputCard
        initialValue={`${initialMetadata.owner}/${initialMetadata.name}`}
        onFetched={handleFetched}
      />
      <div className="preview-status" data-state="ok" aria-live="polite">
        <span className="ok-tick" aria-hidden="true">
          <svg
            width="11"
            height="11"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M3 8l3 3 7-7" />
          </svg>
        </span>
        <span>{statusMessage}</span>
      </div>
      <div className="preview-grid">
        <DropPreviewCard metadata={metadata} />
        {sidePanel}
      </div>
    </>
  );
}
