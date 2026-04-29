// TrendingRepo — Tier List Zod schemas
//
// Used by:
//  - POST /api/tier-lists                 (validates the editor draft)
//  - GET  /api/tier-lists/[shortId]       (re-parses the stored payload)
//  - The URL state decoder                (lossless boundary check)

import { z } from "zod";

import {
  MAX_DESCRIPTION_CHARS,
  MAX_ITEMS_PER_TIER,
  MAX_ITEMS_TOTAL,
  MAX_LABEL_CHARS,
  MAX_TIERS,
  MAX_TITLE_CHARS,
  MIN_TIERS,
  TIER_COLORS,
} from "@/lib/tier-list/constants";

const tierColorSchema = z.enum(
  TIER_COLORS as unknown as [string, ...string[]],
);

// "vercel/next.js" — owner and name segments restricted to GitHub's safe chars.
// Keep tight so we don't end up serialising arbitrary user input as a card label.
const repoIdSchema = z
  .string()
  .min(3)
  .max(120)
  .regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/);

const tierRowSchema = z.object({
  id: z.string().min(1).max(32),
  label: z.string().min(1).max(MAX_LABEL_CHARS),
  color: tierColorSchema,
  items: z.array(repoIdSchema).max(MAX_ITEMS_PER_TIER),
});

const handleSchema = z.string().regex(/^[A-Za-z0-9_]{1,15}$/);

// Base ZodObject — extended below for the persisted payload.
const draftBaseSchema = z.object({
  title: z.string().min(1).max(MAX_TITLE_CHARS),
  description: z.string().max(MAX_DESCRIPTION_CHARS).optional(),
  tiers: z.array(tierRowSchema).min(MIN_TIERS).max(MAX_TIERS),
  unrankedItems: z.array(repoIdSchema).max(MAX_ITEMS_TOTAL),
  ownerHandle: handleSchema.nullable().optional(),
  published: z.boolean().optional(),
});

// De-dupe + total-cap check shared between the draft and the persisted shape.
function refineNoDupes(
  draft: { tiers: Array<{ items: string[] }>; unrankedItems: string[] },
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const tier of draft.tiers) {
    for (const item of tier.items) {
      if (seen.has(item)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Repo "${item}" appears in multiple tiers.`,
          path: ["tiers"],
        });
        return;
      }
      seen.add(item);
    }
  }
  for (const item of draft.unrankedItems) {
    if (seen.has(item)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Repo "${item}" is in both a tier and the unranked pool.`,
        path: ["unrankedItems"],
      });
      return;
    }
    seen.add(item);
  }
  if (seen.size > MAX_ITEMS_TOTAL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Tier list exceeds the ${MAX_ITEMS_TOTAL}-item cap.`,
      path: ["tiers"],
    });
  }
}

export const tierListDraftSchema = draftBaseSchema.superRefine(refineNoDupes);

export const tierListPayloadSchema = draftBaseSchema
  .extend({
    shortId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{8}$/),
    createdAt: z.string(),
    updatedAt: z.string(),
    viewCount: z.number().int().nonnegative(),
    published: z.boolean(),
    ownerHandle: handleSchema.nullable(),
  })
  .superRefine(refineNoDupes);

export type TierListDraftInput = z.infer<typeof tierListDraftSchema>;
export type TierListPayloadParsed = z.infer<typeof tierListPayloadSchema>;
