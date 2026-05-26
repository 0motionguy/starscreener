// Twitter share text composer for tier lists.
//
// Pure function — extracted from ShareBar.tsx so it can be tested
// without React. The output is the body of the tweet (everything
// between the URL and the trailing `#hashtag via @handle` line).
//
// Output shape (under ~220 chars by default):
//
//   AI Coding Agents · 2026
//
//   S — claude-code, codex, cursor
//   A — cline, aider
//   B — goose, OpenHands
//
// Rules:
//   - Empty tiers are skipped entirely (no `D — ` clutter for unranked tiers).
//   - Repo IDs are stripped of the `owner/` prefix for density.
//   - Per-tier overflow appends `+N more` rather than truncating mid-name.
//   - The whole body is hard-capped at `maxChars` so the composer never
//     blows Twitter's 280-char budget once a 23-char URL and ~32 chars of
//     `#tierlist #github via @TrendingRepo` get appended by the builder.

import type { TierRow } from "@/lib/types/tier-list";

export interface ComposeTierShareTextInput {
  title: string;
  tiers: TierRow[];
}

export function composeTierShareText(
  input: ComposeTierShareTextInput,
  maxChars: number,
): string {
  const titleLine = input.title.trim();
  const blockLines: string[] = [];
  let used = titleLine.length + 2; // title + blank line separator

  for (const tier of input.tiers) {
    if (tier.items.length === 0) continue;
    const names = tier.items.map(
      (id) => id.split("/")[1]?.trim() ?? id,
    );
    const prefix = `${tier.label} — `;
    const remaining = maxChars - used - prefix.length;
    if (remaining < 6) break; // not enough room for even a short name

    const joined = names.join(", ");
    let line: string;
    if (joined.length <= remaining) {
      line = `${prefix}${joined}`;
    } else {
      // Walk names until we'd overflow; ellipse with `+N more`.
      const kept: string[] = [];
      let lineLen = 0;
      for (const name of names) {
        const addLen = kept.length === 0 ? name.length : name.length + 2;
        const moreLen = 6 + String(names.length - kept.length - 1).length;
        if (lineLen + addLen + moreLen > remaining) break;
        kept.push(name);
        lineLen += addLen;
      }
      if (kept.length === 0) {
        // Even the first name doesn't fit; truncate it.
        const head = names[0]!.slice(0, Math.max(3, remaining - 1)) + "…";
        line = `${prefix}${head}`;
      } else {
        const overflow = names.length - kept.length;
        line =
          overflow > 0
            ? `${prefix}${kept.join(", ")} +${overflow} more`
            : `${prefix}${kept.join(", ")}`;
      }
    }
    blockLines.push(line);
    used += line.length + 1; // +1 for newline
    if (used >= maxChars - 4) break;
  }

  if (blockLines.length === 0) {
    return titleLine; // nothing to summarise
  }
  return `${titleLine}\n\n${blockLines.join("\n")}`;
}
