// GET /api/agent-commerce/[slug]
// Returns a single item + up to 4 related entries.

import { NextResponse } from "next/server";
import { z } from "zod";

import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { errorEnvelope, serverError } from "@/lib/api/error-response";
import {
  getAgentCommerceItem,
  getAgentCommerceItems,
  refreshAgentCommerceFromStore,
} from "@/lib/agent-commerce";
import type { AgentCommerceItem } from "@/lib/agent-commerce/types";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ slug: string }>;
}
const ParamsSchema = z.object({
  slug: z.string().trim().min(1),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const parsedParams = ParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(errorEnvelope("invalid slug", "INVALID_SLUG"), {
        status: 400,
      });
    }
    await refreshAgentCommerceFromStore();
    const item = getAgentCommerceItem(parsedParams.data.slug);
    if (!item) {
      return NextResponse.json(errorEnvelope("not_found", "AC_NOT_FOUND"), {
        status: 404,
      });
    }

    const related: AgentCommerceItem[] = getAgentCommerceItems()
      .filter(
        (it) =>
          it.id !== item.id &&
          (it.category === item.category || it.kind === item.kind),
      )
      .sort((a, b) => b.scores.composite - a.scores.composite)
      .slice(0, 4);

    return NextResponse.json({ item, related }, { headers: READ_CACHE_HEADERS });
  } catch (error) {
    return serverError(error, {
      scope: "[api/agent-commerce/[slug]]",
      code: "AGENT_COMMERCE_DETAIL_FAILED",
    });
  }
}
