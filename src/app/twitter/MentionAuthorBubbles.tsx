"use client";

// Phase 5.2 SSR diet: this component receives author bubbles WITHOUT the
// pre-baked avatarUrl. SSR ships only handle/profileUrl/postUrl/engagement
// (~10x smaller than shipping the URL via RSC double-serialization). The
// avatar URL `https://unavatar.io/twitter/<handle>` is reconstructed
// client-side, then `<img loading="lazy">` defers the network fetch until
// the row scrolls into the viewport. The initial letter renders
// immediately and remains visible behind the image (so a 429 from
// unavatar.io leaves the colored circle + letter — same fallback the SSR
// version had via the absolute-positioned <span>).
//
// Why a fresh client component vs. patching the existing server-side
// MentionAuthorBubbles in page.tsx: page.tsx is a server component
// (async data fetch + ISR) and can't carry a "use client" directive.
// Pulling the bubbles out is the cheapest boundary.

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/utils";
import type { TwitterMentionAuthorBubble } from "@/lib/twitter/types";

const AUTHOR_BUBBLE_TONES = [
  {
    backgroundColor: "rgba(122, 167, 255, 0.16)",
    borderColor: "rgba(122, 167, 255, 0.36)",
    color: "#bcd2ff",
  },
  {
    backgroundColor: "rgba(16, 185, 129, 0.16)",
    borderColor: "rgba(16, 185, 129, 0.36)",
    color: "#8df3c9",
  },
  {
    backgroundColor: "rgba(244, 114, 182, 0.16)",
    borderColor: "rgba(244, 114, 182, 0.36)",
    color: "#f9b4d9",
  },
  {
    backgroundColor: "rgba(251, 191, 36, 0.16)",
    borderColor: "rgba(251, 191, 36, 0.36)",
    color: "#f5d778",
  },
  {
    backgroundColor: "rgba(168, 85, 247, 0.16)",
    borderColor: "rgba(168, 85, 247, 0.36)",
    color: "#dbb8ff",
  },
] as const;

function getAuthorBubbleTone(handle: string) {
  let hash = 0;
  for (const char of handle) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return AUTHOR_BUBBLE_TONES[hash % AUTHOR_BUBBLE_TONES.length];
}

function getAuthorInitial(handle: string): string {
  const normalized = handle.replace(/^@+/, "").trim();
  return normalized.charAt(0).toUpperCase() || "X";
}

function getAvatarUrl(handle: string): string | null {
  const normalized = handle.replace(/^@+/, "").trim();
  return normalized
    ? `https://unavatar.io/twitter/${encodeURIComponent(normalized)}`
    : null;
}

export function MentionAuthorBubbles({
  authors,
}: {
  authors: TwitterMentionAuthorBubble[];
}) {
  // hydrated=true is what gates rendering of the <img> tags. Held off
  // until effect-time so the initial server HTML is purely the colored
  // circle + initial — no avatar URL strings travel through the SSR
  // payload at all (the avatar URL is derived from the handle in the
  // browser).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  if (authors.length === 0) {
    return <span className="text-[10px] text-text-tertiary">--</span>;
  }

  return (
    <div className="inline-flex items-center justify-center">
      {authors.slice(0, 5).map((author, index) => {
        const tone = getAuthorBubbleTone(author.authorHandle);
        const initial = getAuthorInitial(author.authorHandle);
        const avatarUrl = hydrated ? getAvatarUrl(author.authorHandle) : null;

        return (
          <Link
            key={`${author.profileUrl}:${author.postUrl}`}
            href={author.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${
              index === 0 ? "" : "-ml-1.5"
            } relative inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border text-[9px] font-semibold uppercase ring-1 ring-bg-secondary transition-transform hover:z-10 hover:-translate-y-0.5`}
            style={tone}
            aria-label={`Open top X mention from @${author.authorHandle}`}
            title={`@${author.authorHandle} - ${formatNumber(author.engagement)} engagement`}
          >
            {/* Initial sits behind the image so it shows through when
                unavatar.io rate-limits us (429) or the avatar URL otherwise
                fails to load. Without this, broken-image placeholders
                rendered as empty colored circles in production. */}
            <span aria-hidden className="absolute inset-0 flex items-center justify-center">
              {initial}
            </span>
            {avatarUrl ? (
              // Plain <img> with native loading="lazy" — Browser defers
              // the network request until the bubble nears the viewport.
              // We deliberately avoid next/image here: (1) the image
              // optimizer can't optimize unavatar.io anyway (we'd pass
              // unoptimized), (2) <Image> ships extra wrapper markup
              // which compounds the SSR-payload problem we're solving,
              // (3) `loading="lazy"` is universally supported and
              // requires zero JS.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                width={20}
                height={20}
                loading="lazy"
                decoding="async"
                className="relative h-full w-full object-cover"
              />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
