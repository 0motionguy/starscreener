// GET /api/models
//
// Public LLM model catalog — the JSON behind the /models leaderboard.
// Reads `llm-model-metadata` via the data-store (Redis in prod, bundled seed
// as fallback). Optional query params mirror the page controls:
//   ?provider=anthropic  ?capability=reasoning  ?search=claude  ?sort=value
//   &dir=asc|desc  &limit=100

import { NextRequest, NextResponse } from "next/server";

import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { serverError } from "@/lib/api/error-response";
import {
  filterModels,
  getModels,
  getModelsSyncedAt,
  listProviders,
  refreshModelsFromStore,
  sortModels,
  type ModelSortKey,
} from "@/lib/models";

export const runtime = "nodejs";

const VALID_SORT = new Set<ModelSortKey>([
  "value",
  "input_price",
  "output_price",
  "context",
  "name",
  "provider",
]);
const VALID_CAP = new Set(["tools", "vision", "reasoning"]);

export async function GET(request: NextRequest) {
  try {
    await refreshModelsFromStore();

    const sp = request.nextUrl.searchParams;
    const provider = sp.get("provider")?.trim() || undefined;
    const capRaw = sp.get("capability")?.trim();
    const capability = capRaw && VALID_CAP.has(capRaw)
      ? (capRaw as "tools" | "vision" | "reasoning")
      : undefined;
    const search = sp.get("search")?.trim() || undefined;
    const sortRaw = sp.get("sort")?.trim();
    const sort: ModelSortKey =
      sortRaw && VALID_SORT.has(sortRaw as ModelSortKey)
        ? (sortRaw as ModelSortKey)
        : "value";
    const dirRaw = sp.get("dir")?.trim();
    const dir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : undefined;
    const limitRaw = Number.parseInt(sp.get("limit") ?? "", 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 1000)
      : undefined;

    const all = getModels();
    const filtered = filterModels(all, { provider, capability, search });
    const sorted = sortModels(filtered, sort, dir);
    const models = limit ? sorted.slice(0, limit) : sorted;

    return NextResponse.json(
      {
        ok: true as const,
        syncedAt: getModelsSyncedAt(),
        total: all.length,
        count: models.length,
        providers: listProviders(all),
        models,
      },
      { headers: READ_CACHE_HEADERS },
    );
  } catch (err) {
    return serverError(err, { scope: "[api:models]" });
  }
}
