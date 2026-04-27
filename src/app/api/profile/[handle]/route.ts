// GET /api/profile/[handle]
//
// Public JSON view of a user profile. Same aggregation as /u/[handle]
// but returned as raw data — for MCP tools, external integrations, and
// any agent that wants to answer "what is this user up to" without
// scraping the HTML.

import { NextRequest, NextResponse } from "next/server";

import { serverError } from "@/lib/api/error-response";
import { getProfile, type Profile } from "@/lib/profile";

interface ProfileResponse {
  ok: true;
  profile: Profile;
}

interface ErrorResponse {
  ok: false;
  error: string;
}

interface RouteContext {
  params: Promise<{ handle: string }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse<ProfileResponse | ErrorResponse>> {
  const { handle } = await context.params;
  if (!handle || handle.length > 64) {
    return NextResponse.json(
      { ok: false, error: "handle is required (<= 64 chars)" },
      { status: 400 },
    );
  }
  try {
    const profile = await getProfile(handle);
    return NextResponse.json({ ok: true, profile });
  } catch (err) {
    return serverError(err, { scope: "[profile]" });
  }
}
