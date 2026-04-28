// /api/watchlist/private — server-side private watchlist CRUD (Pro tier).
//
// Watchlists currently live in localStorage, which is fine for anonymous
// users but not durable for paying ones. This route backs the server-side
// copy used by Pro accounts so a watchlist survives browser resets and is
// reachable from the MCP / CLI.
//
// Auth: cookie-session (ss_user) or x-user-token / Bearer. Missing → 401.
// Gate: canUseFeature(userId, "watchlist.private"). Free tier → 402.
//
// Cross-user safety: the `userId` used for reads/writes comes only from
// `verifyUserAuth(request)`. We never accept a userId from the body or
// query — that's the historical forgery vector and we guard against it
// at the type level (the store's API only accepts the authenticated id).
//
// Cache-Control: `private, no-store` on every response. This is
// per-user state; it must not be reused by anything downstream.
//
// Verbs:
//   - GET    → returns { entry | null }
//   - PUT    → upsert  { fullNames: string[] }
//   - DELETE → remove the entry
//
// Note on entitlements: this route imports `canUseFeature` from
// `@/lib/pricing/entitlements` — the parallel pricing agent's helper.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { userAuthFailureResponse, verifyUserAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { canUseFeature } from "@/lib/pricing/entitlements";
import {
  deletePrivateWatchlist,
  getPrivateWatchlist,
  MAX_PRIVATE_WATCHLIST_REPOS,
  normalizeFullNames,
  setPrivateWatchlist,
  type PrivateWatchlistEntry,
} from "@/lib/watchlist/private-store";

export const runtime = "nodejs";

// MAX_PRIVATE_WATCHLIST_REPOS is checked post-parse to preserve the
// discrete `code: TOO_MANY_REPOS` discriminator (asserted by
// pipeline/__tests__/private-watchlist.test.ts:284).
const PrivateWatchlistPutSchema = z.object({
  fullNames: z.array(z.string(), {
    message: "fullNames must be an array of strings",
  }),
});

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

const PRIVATE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store",
  "Vary": "Cookie, Authorization, x-user-token",
};

function jsonNoStore(
  body: unknown,
  init: { status?: number } = {},
): NextResponse {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: PRIVATE_HEADERS,
  });
}

// ---------------------------------------------------------------------------
// Auth + gate helper
// ---------------------------------------------------------------------------

interface Gate {
  ok: true;
  userId: string;
}

async function authorize(
  request: NextRequest,
): Promise<Gate | NextResponse> {
  const auth = verifyUserAuth(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny;
  if (auth.kind !== "ok") {
    return jsonNoStore(
      { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const { userId } = auth;

  const allowed = await canUseFeature(userId, "watchlist.private");
  if (!allowed) {
    return jsonNoStore(
      {
        ok: false,
        error: "private-watchlist is a Pro-tier feature",
        code: "PAYMENT_REQUIRED",
        upgradeUrl: "/pricing#pro",
      },
      { status: 402 },
    );
  }
  return { ok: true, userId };
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

interface GetResponseBody {
  ok: true;
  entry: PrivateWatchlistEntry | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await authorize(request);
  if (gate instanceof NextResponse) return gate;

  const entry = await getPrivateWatchlist(gate.userId);
  const body: GetResponseBody = { ok: true, entry };
  return jsonNoStore(body);
}

// ---------------------------------------------------------------------------
// PUT — upsert
// ---------------------------------------------------------------------------

interface PutResponseBody {
  ok: true;
  entry: PrivateWatchlistEntry;
  /** Caller-supplied fullNames that failed validation (dropped). */
  dropped: string[];
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const gate = await authorize(request);
  if (gate instanceof NextResponse) return gate;

  const parsed = await parseBody(request, PrivateWatchlistPutSchema);
  if (!parsed.ok) {
    // Re-shape parseBody's response onto the per-route private headers.
    // Body shape stays { ok:false, error, code? } from the canonical helper.
    const errBody = await parsed.response.json();
    return jsonNoStore(errBody, { status: parsed.response.status });
  }
  if (parsed.data.fullNames.length > MAX_PRIVATE_WATCHLIST_REPOS) {
    return jsonNoStore(
      {
        ok: false,
        error: `too many repos (max ${MAX_PRIVATE_WATCHLIST_REPOS})`,
        code: "TOO_MANY_REPOS",
      },
      { status: 400 },
    );
  }

  const { fullNames: rawList } = parsed.data;
  const { valid: _valid, invalid } = normalizeFullNames(rawList);
  // Normalization / validation happens inside setPrivateWatchlist too; we
  // call it here only to expose the `dropped` list in the response so
  // the client can surface it in a toast.
  const entry = await setPrivateWatchlist(gate.userId, rawList);

  const response: PutResponseBody = { ok: true, entry, dropped: invalid };
  return jsonNoStore(response);
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

interface DeleteResponseBody {
  ok: true;
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const gate = await authorize(request);
  if (gate instanceof NextResponse) return gate;

  await deletePrivateWatchlist(gate.userId);
  const body: DeleteResponseBody = { ok: true };
  return jsonNoStore(body);
}
