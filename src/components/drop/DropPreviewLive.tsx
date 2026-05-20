"use client";

// DropPreviewLive — client context provider + two slots that lift the
// URL → metadata fetch from DropUrlInputCard into shared state, then
// re-render DropPreviewCard with the live snapshot. Layout faithful:
//   <DropPreviewLive.Provider>
//     <DropPreviewLive.UrlSlot />        ← full-width url-card
//     <div className="preview-grid">
//       <DropPreviewLive.PreviewSlot />  ← preview-card column
//       <aside>…</aside>
//     </div>
//   </DropPreviewLive.Provider>
//
// Without this lift the URL fetch result never reaches the preview card
// because the two siblings can't share React state directly.

import { createContext, useContext, useMemo, useState } from "react";

import {
  DropPreviewCard,
  type DropPreviewMetadata,
} from "./DropPreviewCard";
import { DropUrlInputCard } from "./DropUrlInputCard";

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
  raw?: unknown;
}

interface DropPreviewContextValue {
  metadata: DropPreviewMetadata | null;
  setMetadata: (md: DropPreviewMetadata | null) => void;
}

const DropPreviewContext = createContext<DropPreviewContextValue | null>(null);

function useDropPreview(): DropPreviewContextValue {
  const ctx = useContext(DropPreviewContext);
  if (!ctx) {
    throw new Error(
      "DropPreviewLive slots must render inside DropPreviewLive.Provider",
    );
  }
  return ctx;
}

function extractMentions(raw: unknown): DropPreviewMetadata["mentions"] {
  if (!raw || typeof raw !== "object") return [];
  const body = raw as Record<string, unknown>;
  const candidate = body.mentions;
  if (Array.isArray(candidate)) {
    return candidate.map((m, i) => {
      const obj = (m ?? {}) as Record<string, unknown>;
      const platform =
        typeof obj.platform === "string"
          ? obj.platform
          : typeof obj.source === "string"
            ? obj.source
            : `source-${i}`;
      const label =
        typeof obj.label === "string"
          ? obj.label
          : typeof obj.title === "string"
            ? obj.title
            : platform;
      const count =
        typeof obj.count === "number"
          ? obj.count
          : typeof obj.score === "number"
            ? obj.score
            : undefined;
      return { platform, label, count };
    });
  }
  if (candidate && typeof candidate === "object") {
    const items = (candidate as Record<string, unknown>).items;
    if (Array.isArray(items)) return extractMentions({ mentions: items });
  }
  return [];
}

function toPreviewMetadata(md: FetchedMetadata): DropPreviewMetadata {
  return {
    owner: md.owner,
    name: md.name,
    description: md.description ?? null,
    language: md.language ?? null,
    license: md.license ?? null,
    stars: md.stars ?? null,
    forks: md.forks ?? null,
    contributors: md.contributors ?? null,
    pypiWeekly: null,
    mentions: extractMentions(md.raw),
    fetchedAt: new Date().toISOString(),
  };
}

interface ProviderProps {
  children: React.ReactNode;
}

function Provider({ children }: ProviderProps) {
  const [metadata, setMetadata] = useState<DropPreviewMetadata | null>(null);
  const value = useMemo(() => ({ metadata, setMetadata }), [metadata]);
  return (
    <DropPreviewContext.Provider value={value}>
      {children}
    </DropPreviewContext.Provider>
  );
}

interface UrlSlotProps {
  initialValue?: string;
}

function UrlSlot({ initialValue }: UrlSlotProps) {
  const { setMetadata } = useDropPreview();
  return (
    <DropUrlInputCard
      initialValue={initialValue}
      onFetched={(fetched) => setMetadata(toPreviewMetadata(fetched))}
    />
  );
}

function PreviewSlot() {
  const { metadata } = useDropPreview();
  return <DropPreviewCard metadata={metadata} />;
}

export const DropPreviewLive = {
  Provider,
  UrlSlot,
  PreviewSlot,
};
